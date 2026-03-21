const express = require('express');
const router = express.Router();

const { authenticateToken, authorize } = require('../middleware/auth');

const SalesAgentProfile = require('../models/SalesAgentProfile');
const SalesConfig        = require('../models/SalesConfig');
const User               = require('../models/User');
const PaymentLog         = require('../models/PaymentLog');
const Rate               = require('../models/Rate');
const Label              = require('../models/Label');
const ManifestJob        = require('../models/ManifestJob');
const { getUsdToPkrRate } = require('../services/exchangeRateService');

// ── Helper ─────────────────────────────────────────────────────────────────────

/**
 * Calculate per-month KPI stats for a sales agent.
 *
 * Incentive calculation uses per-vendor-formula overrides when available,
 * falling back to the agent's default threshold/rsPerUnit.
 *
 * @param {Object} agentProfile  - SalesAgentProfile document
 * @param {number} month         - 1-12
 * @param {number} year          - e.g. 2025
 * @param {Object} config        - SalesConfig document
 * @param {number} usdToPkrRate  - Live exchange rate (computed once per request)
 */
async function calculateAgentStats(agentProfile, month, year, config, usdToPkrRate) {
  const agentUser = await User.findById(agentProfile.user).populate(
    'clients',
    'firstName lastName email isActive'
  );

  if (!agentUser) {
    return {
      clients: [],
      totalDepositsUSD: 0,
      totalRevenueUSD: 0,
      totalLabelCount: 0,
      grossProfitPKR: 0,
      totalIncentivePKR: 0,
      baseSalaryPKR: agentProfile.baseSalaryPKR,
      totalExpensePKR: agentProfile.baseSalaryPKR,
      netProfitPKR: -agentProfile.baseSalaryPKR,
      month,
      year,
    };
  }

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month,     1);

  const clientBreakdowns = [];
  let totalDepositsUSD  = 0;
  let totalRevenueUSD   = 0;
  let totalLabelCount   = 0;
  let totalIncentivePKR = 0;

  for (const client of agentUser.clients) {
    const clientId = client._id;

    // Current label rate for this client
    const rateDoc    = await Rate.getCurrentRate(clientId);
    const clientRate = rateDoc?.labelRate || 0;

    // Deposits in the given month
    const deposits = await PaymentLog.aggregate([
      { $match: { user: clientId, date: { $gte: start, $lt: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const clientPaidUSD = deposits[0]?.total || 0;

    // Estimated label count from deposits
    const estimatedLabels = clientRate > 0 ? clientPaidUSD / clientRate : 0;

    // ── Revenue aggregations ───────────────────────────────────────────────

    const labelRev = await Label.aggregate([
      {
        $match: {
          user: clientId,
          createdAt: { $gte: start, $lt: end },
          status: 'generated',
        },
      },
      {
        $group: {
          _id:   null,
          total: { $sum: '$price' },
          count: { $sum: 1 },
        },
      },
    ]);

    const manifestRev = await ManifestJob.aggregate([
      {
        $match: {
          user: clientId,
          createdAt: { $gte: start, $lt: end },
          status: 'completed',
        },
      },
      {
        $group: {
          _id:    null,
          total:  { $sum: '$userBilling.totalAmount' },
          labels: { $sum: '$userBilling.labelCount' },
        },
      },
    ]);

    const clientRevUSD     = (labelRev[0]?.total  || 0) + (manifestRev[0]?.total  || 0);
    const clientLabelCount = (labelRev[0]?.count  || 0) + (manifestRev[0]?.labels || 0);

    // ── Per-vendor incentive calculation ──────────────────────────────────

    const incentivePKR = await calcVendorIncentive(
      agentProfile,
      clientId,
      start,
      end,
      clientRate,
      estimatedLabels
    );

    clientBreakdowns.push({
      clientId:       clientId.toString(),
      name:           `${client.firstName} ${client.lastName}`,
      email:          client.email,
      isActive:       client.isActive,
      clientRate,
      clientPaidUSD,
      estimatedLabels,
      clientRevUSD,
      clientLabelCount,
      incentivePKR,
    });

    totalDepositsUSD  += clientPaidUSD;
    totalRevenueUSD   += clientRevUSD;
    totalLabelCount   += clientLabelCount;
    totalIncentivePKR += incentivePKR;
  }

  const grossProfitPKR  = totalRevenueUSD * usdToPkrRate;
  const baseSalaryPKR   = agentProfile.baseSalaryPKR;
  const totalExpensePKR = baseSalaryPKR + totalIncentivePKR;
  const netProfitPKR    = grossProfitPKR - baseSalaryPKR - totalIncentivePKR;

  return {
    clients: clientBreakdowns,
    totalDepositsUSD,
    totalRevenueUSD,
    totalLabelCount,
    grossProfitPKR,
    totalIncentivePKR,
    baseSalaryPKR,
    totalExpensePKR,
    netProfitPKR,
    month,
    year,
  };
}

/**
 * Calculate the total incentive PKR for one client using per-vendor formula overrides.
 *
 * Strategy:
 *  1. Aggregate actual label counts by vendorName (Label model + ManifestJob via $lookup).
 *  2. For each vendor group, resolve the matching vendorFormula from the agent profile.
 *     If no override is found, fall back to the agent's root-level defaults.
 *  3. Split estimatedLabels proportionally across vendor groups.
 *  4. Apply the formula per group and sum.
 */
async function calcVendorIncentive(agentProfile, clientId, start, end, clientRate, estimatedLabels) {
  if (estimatedLabels <= 0) return 0;

  // Labels from Label model grouped by vendorName
  const labelsByVendor = await Label.aggregate([
    {
      $match: {
        user: clientId,
        createdAt: { $gte: start, $lt: end },
        status: 'generated',
      },
    },
    {
      $group: {
        _id:   '$vendorName',
        count: { $sum: 1 },
      },
    },
  ]);

  // Labels from ManifestJob — resolve vendorName via $lookup
  const manifestByVendor = await ManifestJob.aggregate([
    {
      $match: {
        user: clientId,
        createdAt: { $gte: start, $lt: end },
        status: 'completed',
      },
    },
    {
      $lookup: {
        from:         'manifestvendors',
        localField:   'assignedVendor',
        foreignField: '_id',
        as:           'mvDoc',
      },
    },
    {
      $lookup: {
        from:         'vendors',
        localField:   'vendor',
        foreignField: '_id',
        as:           'vDoc',
      },
    },
    {
      $addFields: {
        resolvedVendor: {
          $ifNull: [
            { $arrayElemAt: ['$mvDoc.name', 0] },
            { $ifNull: [
              { $arrayElemAt: ['$vDoc.name', 0] },
              { $concat: ['$carrier', ' Manifest'] },
            ]},
          ],
        },
      },
    },
    {
      $group: {
        _id:   '$resolvedVendor',
        count: { $sum: '$userBilling.labelCount' },
      },
    },
  ]);

  // Merge into a single map: vendorName → totalCount
  const vendorMap = {};
  for (const row of labelsByVendor)  vendorMap[row._id || 'Unknown'] = (vendorMap[row._id || 'Unknown'] || 0) + row.count;
  for (const row of manifestByVendor) vendorMap[row._id || 'Unknown'] = (vendorMap[row._id || 'Unknown'] || 0) + row.count;

  const totalActualLabels = Object.values(vendorMap).reduce((s, c) => s + c, 0);

  if (totalActualLabels === 0) {
    // No actual labels found — use agent-level defaults
    if (clientRate > agentProfile.incentiveThreshold) {
      return ((clientRate - agentProfile.incentiveThreshold) / 0.01)
        * agentProfile.incentiveRsPerUnit
        * estimatedLabels;
    }
    return 0;
  }

  // Distribute estimatedLabels proportionally and apply formula per vendor
  let totalIncentive = 0;

  for (const [vendorName, count] of Object.entries(vendorMap)) {
    const share         = count / totalActualLabels;
    const vendorEstLabels = estimatedLabels * share;

    // Find a matching active formula override
    const override = (agentProfile.vendorFormulas || []).find(
      (f) => f.isActive && f.vendorName === vendorName
    );

    const threshold = override ? override.incentiveThreshold : agentProfile.incentiveThreshold;
    const rsPerUnit = override ? override.incentiveRsPerUnit : agentProfile.incentiveRsPerUnit;

    if (clientRate > threshold) {
      totalIncentive += ((clientRate - threshold) / 0.01) * rsPerUnit * vendorEstLabels;
    }
  }

  return totalIncentive;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.use(authenticateToken);

// ── GET /api/sales-agents/exchange-rate  (must be BEFORE /:id)
router.get('/exchange-rate', authorize('admin'), async (req, res) => {
  try {
    const config = await SalesConfig.getConfig();
    const result = await getUsdToPkrRate(config.usdToPkrRate || 280);
    res.json(result);
  } catch (err) {
    console.error('GET /sales-agents/exchange-rate error:', err);
    res.status(500).json({ message: 'Failed to fetch exchange rate' });
  }
});

// ── GET /api/sales-agents/config  (must be BEFORE /:id)
router.get('/config', authorize('admin'), async (req, res) => {
  try {
    const config = await SalesConfig.getConfig();
    res.json(config);
  } catch (err) {
    console.error('GET /sales-agents/config error:', err);
    res.status(500).json({ message: 'Failed to fetch sales config' });
  }
});

// ── PUT /api/sales-agents/config  (defaultThreshold + defaultRsPerUnit only)
router.put('/config', authorize('admin'), async (req, res) => {
  try {
    const { defaultThreshold, defaultRsPerUnit } = req.body;

    const updateFields = { updatedBy: req.user._id };
    if (defaultThreshold !== undefined) updateFields.defaultThreshold = defaultThreshold;
    if (defaultRsPerUnit  !== undefined) updateFields.defaultRsPerUnit  = defaultRsPerUnit;

    const config = await SalesConfig.findOneAndUpdate(
      {},
      updateFields,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(config);
  } catch (err) {
    console.error('PUT /sales-agents/config error:', err);
    res.status(500).json({ message: 'Failed to update sales config' });
  }
});

// ── GET /api/sales-agents  — list all active agents with stats
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const config = await SalesConfig.getConfig();

    // Fetch live exchange rate once for all agents
    const { rate: usdToPkrRate, source: rateSource } = await getUsdToPkrRate(config.usdToPkrRate || 280);

    const profiles = await SalesAgentProfile.find({ isActive: true }).populate(
      'user',
      'firstName lastName email role clients isActive'
    );

    const results = await Promise.all(
      profiles.map(async (profile) => {
        const stats = await calculateAgentStats(profile, month, year, config, usdToPkrRate);
        return {
          _id:                profile._id,
          user:               profile.user,
          baseSalaryPKR:      profile.baseSalaryPKR,
          incentiveThreshold: profile.incentiveThreshold,
          incentiveRsPerUnit: profile.incentiveRsPerUnit,
          vendorFormulas:     profile.vendorFormulas,
          isActive:           profile.isActive,
          salaryLogs:         profile.salaryLogs,
          notes:              profile.notes,
          createdAt:          profile.createdAt,
          updatedAt:          profile.updatedAt,
          stats,
        };
      })
    );

    results.sort((a, b) => (b.stats?.netProfitPKR || 0) - (a.stats?.netProfitPKR || 0));
    results.forEach((r, i) => { r.rank = i + 1; });

    res.json({ agents: results, usdToPkrRate, rateSource });
  } catch (err) {
    console.error('GET /sales-agents error:', err);
    res.status(500).json({ message: 'Failed to fetch sales agents' });
  }
});

// ── POST /api/sales-agents  — tag a reseller as a sales agent
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { userId, baseSalaryPKR, incentiveThreshold, incentiveRsPerUnit, notes } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'reseller') {
      return res.status(400).json({ message: 'Only reseller accounts can be tagged as sales agents' });
    }

    const existing = await SalesAgentProfile.findOne({ user: userId });
    if (existing) {
      return res.status(409).json({ message: 'This user is already tagged as a sales agent' });
    }

    const config = await SalesConfig.getConfig();

    const profile = await SalesAgentProfile.create({
      user: userId,
      baseSalaryPKR:      baseSalaryPKR      ?? 0,
      incentiveThreshold: incentiveThreshold ?? config.defaultThreshold,
      incentiveRsPerUnit: incentiveRsPerUnit ?? config.defaultRsPerUnit,
      notes:              notes              ?? '',
    });

    await profile.populate('user', 'firstName lastName email role clients');

    res.status(201).json(profile);
  } catch (err) {
    console.error('POST /sales-agents error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'This user is already a sales agent' });
    }
    res.status(500).json({ message: 'Failed to create sales agent profile' });
  }
});

// ── PUT /api/sales-agents/:id  — update agent base formula / settings
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { baseSalaryPKR, incentiveThreshold, incentiveRsPerUnit, notes, isActive } = req.body;

    const updateFields = {};
    if (baseSalaryPKR      !== undefined) updateFields.baseSalaryPKR      = baseSalaryPKR;
    if (incentiveThreshold !== undefined) updateFields.incentiveThreshold = incentiveThreshold;
    if (incentiveRsPerUnit !== undefined) updateFields.incentiveRsPerUnit = incentiveRsPerUnit;
    if (notes              !== undefined) updateFields.notes              = notes;
    if (isActive           !== undefined) updateFields.isActive           = isActive;

    const profile = await SalesAgentProfile.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    ).populate('user', 'firstName lastName email role clients');

    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    res.json(profile);
  } catch (err) {
    console.error('PUT /sales-agents/:id error:', err);
    res.status(500).json({ message: 'Failed to update sales agent profile' });
  }
});

// ── PUT /api/sales-agents/:id/vendor-formulas  — replace all vendor formula overrides
router.put('/:id/vendor-formulas', authorize('admin'), async (req, res) => {
  try {
    const { vendorFormulas } = req.body;

    if (!Array.isArray(vendorFormulas)) {
      return res.status(400).json({ message: 'vendorFormulas must be an array' });
    }

    const profile = await SalesAgentProfile.findByIdAndUpdate(
      req.params.id,
      { vendorFormulas },
      { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email role clients');

    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    res.json(profile);
  } catch (err) {
    console.error('PUT /sales-agents/:id/vendor-formulas error:', err);
    res.status(500).json({ message: 'Failed to update vendor formulas' });
  }
});

// ── GET /api/sales-agents/:id/stats
router.get('/:id/stats', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const profile = await SalesAgentProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    const config = await SalesConfig.getConfig();
    const { rate: usdToPkrRate } = await getUsdToPkrRate(config.usdToPkrRate || 280);
    const stats  = await calculateAgentStats(profile, month, year, config, usdToPkrRate);

    const filteredLogs = profile.salaryLogs.filter(
      (l) => l.month === month && l.year === year
    );

    res.json({ ...stats, salaryLogs: filteredLogs });
  } catch (err) {
    console.error('GET /sales-agents/:id/stats error:', err);
    res.status(500).json({ message: 'Failed to fetch agent stats' });
  }
});

// ── POST /api/sales-agents/:id/salary-log  — log a salary payment
router.post('/:id/salary-log', authorize('admin'), async (req, res) => {
  try {
    const { month, year, baseSalaryPaid, incentivePaid, note } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' });
    }

    const profile = await SalesAgentProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    const logEntry = {
      month,
      year,
      baseSalaryPaid:  baseSalaryPaid  ?? 0,
      incentivePaid:   incentivePaid   ?? 0,
      totalPaid:       (baseSalaryPaid ?? 0) + (incentivePaid ?? 0),
      note:            note ?? '',
      paidAt:          new Date(),
      loggedBy:        req.user._id,
    };

    profile.salaryLogs.push(logEntry);
    await profile.save();

    res.status(201).json({
      message: 'Salary log added',
      log: profile.salaryLogs[profile.salaryLogs.length - 1],
    });
  } catch (err) {
    console.error('POST /sales-agents/:id/salary-log error:', err);
    res.status(500).json({ message: 'Failed to add salary log' });
  }
});

// ── DELETE /api/sales-agents/:id/salary-log/:logId  — remove a log entry
router.delete('/:id/salary-log/:logId', authorize('admin'), async (req, res) => {
  try {
    const profile = await SalesAgentProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    profile.salaryLogs.pull({ _id: req.params.logId });
    await profile.save();

    res.json({ message: 'Salary log removed' });
  } catch (err) {
    console.error('DELETE /sales-agents/:id/salary-log/:logId error:', err);
    res.status(500).json({ message: 'Failed to remove salary log' });
  }
});

// ── DELETE /api/sales-agents/:id  — soft-delete (deactivate)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const profile = await SalesAgentProfile.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    res.json({ message: 'Sales agent deactivated', profile });
  } catch (err) {
    console.error('DELETE /sales-agents/:id error:', err);
    res.status(500).json({ message: 'Failed to deactivate sales agent' });
  }
});

module.exports = router;
