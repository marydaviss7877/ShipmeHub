/**
 * finance.js — Monthly finance reconciliation routes.
 *
 * FIFO payment matching:
 *   Payments cover labels in chronological order regardless of carrier.
 *   For a given month M and carrier C:
 *     priorAllLabels  = total labels (all carriers) generated BEFORE month M
 *     allMonthLabels  = total labels (all carriers) generated IN month M
 *     totalPaidLabels = totalPaymentsUSD / clientRate
 *     remainingForMonth = max(0, totalPaidLabels - priorAllLabels)
 *     carrierPaidLabels = min(carrierMonthLabels, remainingForMonth × (carrierMonthLabels / allMonthLabels))
 */

const express = require('express');
const router = express.Router();

const { authenticateToken, authorize } = require('../middleware/auth');

const Label              = require('../models/Label');
const ManifestJob        = require('../models/ManifestJob');
const PaymentLog         = require('../models/PaymentLog');
const Rate               = require('../models/Rate');
const User               = require('../models/User');
const VendorCost         = require('../models/VendorCost');
const Vendor             = require('../models/Vendor');
const ClientFinanceStatus = require('../models/ClientFinanceStatus');
const SalesAgentProfile  = require('../models/SalesAgentProfile');
const { getUsdToPkrRate } = require('../services/exchangeRateService');
const SalesConfig        = require('../models/SalesConfig');

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Build finance rows for the given clientIds, month, year. */
async function buildFinanceRows(clientIds, month, year) {
  if (!clientIds || clientIds.length === 0) return [];

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month,     1);

  const clientIdStrings = clientIds.map(String);

  // ── Batch aggregations ────────────────────────────────────────────────────

  // 1. Labels in this month per (user, carrier)
  const [apiMonth, mfMonth] = await Promise.all([
    Label.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $gte: monthStart, $lt: monthEnd }, status: 'generated' } },
      { $group: { _id: { user: '$user', carrier: '$carrier' }, count: { $sum: 1 } } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $gte: monthStart, $lt: monthEnd }, status: 'completed' } },
      { $group: { _id: { user: '$user', carrier: '$carrier' }, count: { $sum: '$userBilling.labelCount' } } },
    ]),
  ]);

  // 2. All labels BEFORE this month per client (all carriers combined)
  const [apiPrior, mfPrior] = await Promise.all([
    Label.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $lt: monthStart }, status: 'generated' } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $lt: monthStart }, status: 'completed' } },
      { $group: { _id: '$user', count: { $sum: '$userBilling.labelCount' } } },
    ]),
  ]);

  // 3. Labels in this month per carrier×vendor (for vendor cost calculation)
  const [apiMonthByVendor, mfMonthByVendor] = await Promise.all([
    Label.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $gte: monthStart, $lt: monthEnd }, status: 'generated' } },
      { $group: { _id: { user: '$user', carrier: '$carrier', vendorName: '$vendorName' }, count: { $sum: 1 } } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: { $in: clientIds }, createdAt: { $gte: monthStart, $lt: monthEnd }, status: 'completed' } },
      { $lookup: { from: 'manifestvendors', localField: 'assignedVendor', foreignField: '_id', as: 'mvDoc' } },
      { $lookup: { from: 'vendors',         localField: 'vendor',         foreignField: '_id', as: 'vDoc'  } },
      { $addFields: {
        resolvedVendor: { $ifNull: [
          { $arrayElemAt: ['$mvDoc.name', 0] },
          { $ifNull: [{ $arrayElemAt: ['$vDoc.name', 0] }, null] },
        ]},
      }},
      { $group: { _id: { user: '$user', carrier: '$carrier', vendorName: '$resolvedVendor' }, count: { $sum: '$userBilling.labelCount' } } },
    ]),
  ]);

  // 4. Total cumulative payments per client (all time)
  const paymentRows = await PaymentLog.aggregate([
    { $match: { user: { $in: clientIds } } },
    { $group: { _id: '$user', total: { $sum: '$amount' } } },
  ]);

  // 5. Active rates per client
  const rateRows = await Rate.find({
    user: { $in: clientIds },
    isActive: true,
  }).select('user labelRate');

  // 6. Vendor costs for this month
  const vendorCosts = await VendorCost.find({ month, year });

  // 7. Status records for this month
  const statusDocs = await ClientFinanceStatus.find({ client: { $in: clientIds }, month, year });

  // 8. Sales agent assignments (S P column)
  const agentProfiles = await SalesAgentProfile.find({ isActive: true })
    .populate('user', 'firstName lastName clients');

  // ── Build lookup maps ─────────────────────────────────────────────────────

  // monthTotals: `userId_carrier` → count
  const monthTotals = {};
  for (const r of [...apiMonth, ...mfMonth]) {
    const k = `${r._id.user}_${r._id.carrier}`;
    monthTotals[k] = (monthTotals[k] || 0) + r.count;
  }

  // priorAllLabels: userId → count (all carriers before this month)
  const priorAllLabels = {};
  for (const r of [...apiPrior, ...mfPrior]) {
    const uid = r._id.toString();
    priorAllLabels[uid] = (priorAllLabels[uid] || 0) + r.count;
  }

  // allMonthPerClient: userId → total labels in this month (all carriers)
  const allMonthPerClient = {};
  for (const [k, cnt] of Object.entries(monthTotals)) {
    const uid = k.split('_')[0];
    allMonthPerClient[uid] = (allMonthPerClient[uid] || 0) + cnt;
  }

  // totalPaymentsUSD: userId → cumulative payments
  const totalPaymentsMap = {};
  for (const r of paymentRows) {
    totalPaymentsMap[r._id.toString()] = r.total;
  }

  // clientRates: userId → labelRate
  const clientRateMap = {};
  for (const r of rateRows) {
    clientRateMap[r.user.toString()] = r.labelRate;
  }

  // vendorCostMap: `carrier_vendorName` → costPerLabelUSD (vendorName may be '')
  const vcMap = {};
  for (const vc of vendorCosts) {
    const k = `${vc.carrier}_${vc.vendorName || ''}`;
    vcMap[k] = vc.costPerLabelUSD;
  }

  // vendorCostPerRow: `userId_carrier` → total vendor cost USD
  const vendorCostPerRow = {};
  for (const r of [...apiMonthByVendor, ...mfMonthByVendor]) {
    const { user, carrier, vendorName } = r._id;
    const rowKey = `${user}_${carrier}`;
    // USPS: always use carrier-level cost (ShippersHub cumulative, vendorName = '')
    const vcKey = carrier === 'USPS'
      ? 'USPS_'
      : `${carrier}_${vendorName || ''}`;
    const costPerLabel = vcMap[vcKey] ?? vcMap[`${carrier}_`] ?? 0;
    vendorCostPerRow[rowKey] = (vendorCostPerRow[rowKey] || 0) + costPerLabel * r.count;
  }

  // statusMap: `userId_carrier` → { status, note, _id }
  const statusMap = {};
  for (const s of statusDocs) {
    statusMap[`${s.client}_${s.carrier}`] = { status: s.status, note: s.note, _id: s._id };
  }

  // clientToSP: clientId → reseller initials
  const clientToSP = {};
  for (const profile of agentProfiles) {
    if (!profile.user) continue;
    const initials = `${profile.user.firstName?.charAt(0) || ''}${profile.user.lastName?.charAt(0) || ''}`.toUpperCase();
    for (const cid of (profile.user.clients || [])) {
      clientToSP[cid.toString()] = initials;
    }
  }

  // ── Assemble rows ─────────────────────────────────────────────────────────

  const rows = [];

  for (const [rowKey, monthLabels] of Object.entries(monthTotals)) {
    if (monthLabels <= 0) continue;

    const underscoreIdx = rowKey.indexOf('_');
    const userId  = rowKey.slice(0, underscoreIdx);
    const carrier = rowKey.slice(underscoreIdx + 1);

    if (!clientIdStrings.includes(userId)) continue;

    const clientRate       = clientRateMap[userId] || 0;
    const totalPaymentsUSD = totalPaymentsMap[userId] || 0;
    const priorAll         = priorAllLabels[userId] || 0;
    const allMonthAll      = allMonthPerClient[userId] || 0;

    // FIFO calculation
    let carrierPaidLabels = 0;
    if (clientRate > 0) {
      const totalPaidLabels    = totalPaymentsUSD / clientRate;
      const paidBeforeMonth    = Math.min(priorAll, totalPaidLabels);
      const remainingForMonth  = Math.max(0, totalPaidLabels - paidBeforeMonth);
      const carrierShare       = allMonthAll > 0 ? monthLabels / allMonthAll : 0;
      carrierPaidLabels        = Math.min(monthLabels, remainingForMonth * carrierShare);
    }

    const unpaidLabels    = Math.max(0, monthLabels - carrierPaidLabels);
    const totalAmountUSD  = monthLabels * clientRate;
    const paidByClientUSD = carrierPaidLabels * clientRate;
    const differenceUSD   = paidByClientUSD - totalAmountUSD;
    const vendorCostUSD   = vendorCostPerRow[rowKey] || 0;
    const profitUSD       = paidByClientUSD - vendorCostUSD;

    const statusInfo = statusMap[`${userId}_${carrier}`] || {};
    // Default status: Clear if fully paid, Pending otherwise
    const defaultStatus = unpaidLabels <= 0.05 ? 'Clear' : 'Pending';

    rows.push({
      _rowKey:         rowKey,
      clientId:        userId,
      carrier,
      monthLabels:     Math.round(monthLabels),
      paidLabels:      Math.round(carrierPaidLabels * 10) / 10,
      unpaidLabels:    Math.round(unpaidLabels * 10) / 10,
      clientRate,
      totalAmountUSD:  Math.round(totalAmountUSD  * 100) / 100,
      paidByClientUSD: Math.round(paidByClientUSD * 100) / 100,
      differenceUSD:   Math.round(differenceUSD   * 100) / 100,
      vendorCostUSD:   Math.round(vendorCostUSD   * 100) / 100,
      profitUSD:       Math.round(profitUSD        * 100) / 100,
      status:          statusInfo.status || defaultStatus,
      note:            statusInfo.note   || '',
      statusId:        statusInfo._id    || null,
      spInitials:      clientToSP[userId] || '',
    });
  }

  // Sort: carrier order, then most unpaid first
  const CARRIER_ORDER = { USPS: 0, UPS: 1, FedEx: 2, DHL: 3 };
  rows.sort((a, b) =>
    (CARRIER_ORDER[a.carrier] ?? 9) - (CARRIER_ORDER[b.carrier] ?? 9) ||
    b.unpaidLabels - a.unpaidLabels
  );

  // Attach client info
  const clientDocs = await User.find({ _id: { $in: clientIds } })
    .select('firstName lastName email source');
  const clientInfoMap = {};
  for (const c of clientDocs) {
    clientInfoMap[c._id.toString()] = {
      name:   `${c.firstName} ${c.lastName}`,
      email:  c.email,
      source: c.source || '',
    };
  }

  for (const row of rows) {
    const info = clientInfoMap[row.clientId] || {};
    row.clientName  = info.name  || '';
    row.clientEmail = info.email || '';
    row.source      = info.source || '';
    delete row._rowKey;
  }

  return rows;
}

/** Compute summary KPIs from a rows array. */
function computeSummary(rows) {
  return {
    totalLabels:     rows.reduce((s, r) => s + r.monthLabels,     0),
    paidLabels:      rows.reduce((s, r) => s + r.paidLabels,      0),
    unpaidLabels:    rows.reduce((s, r) => s + r.unpaidLabels,     0),
    totalAmountUSD:  rows.reduce((s, r) => s + r.totalAmountUSD,  0),
    paidByClientUSD: rows.reduce((s, r) => s + r.paidByClientUSD, 0),
    differenceUSD:   rows.reduce((s, r) => s + r.differenceUSD,   0),
    vendorCostUSD:   rows.reduce((s, r) => s + r.vendorCostUSD,   0),
    profitUSD:       rows.reduce((s, r) => s + r.profitUSD,       0),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticateToken);

// ── GET /api/finance?month=M&year=Y  (admin — all clients)
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    // All non-admin users who could have labels
    const clients = await User.find({ role: { $in: ['user', 'reseller'] } }).select('_id');
    const clientIds = clients.map(c => c._id);

    const rows    = await buildFinanceRows(clientIds, month, year);
    const summary = computeSummary(rows);

    // Live exchange rate for PKR display
    const config = await SalesConfig.getConfig();
    const { rate: usdToPkrRate, source: rateSource } = await getUsdToPkrRate(config.usdToPkrRate || 280);

    res.json({ rows, summary, usdToPkrRate, rateSource, month, year });
  } catch (err) {
    console.error('GET /finance error:', err);
    res.status(500).json({ message: 'Failed to fetch finance data' });
  }
});

// ── GET /api/finance/my-clients?month=M&year=Y  (reseller — own clients only)
router.get('/my-clients', authorize('admin', 'reseller'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    let clientIds;
    if (req.user.role === 'admin') {
      const clients = await User.find({ role: { $in: ['user', 'reseller'] } }).select('_id');
      clientIds = clients.map(c => c._id);
    } else {
      const me = await User.findById(req.user._id).select('clients');
      clientIds = me?.clients || [];
    }

    const rows    = await buildFinanceRows(clientIds, month, year);
    const summary = computeSummary(rows);

    // Reseller sees limited columns — strip vendor cost and profit
    const limitedRows = rows.map(({ vendorCostUSD, profitUSD, source, spInitials, ...rest }) => rest);
    const limitedSummary = {
      totalLabels:     summary.totalLabels,
      paidLabels:      summary.paidLabels,
      unpaidLabels:    summary.unpaidLabels,
      totalAmountUSD:  summary.totalAmountUSD,
      paidByClientUSD: summary.paidByClientUSD,
      differenceUSD:   summary.differenceUSD,
    };

    res.json({ rows: limitedRows, summary: limitedSummary, month, year });
  } catch (err) {
    console.error('GET /finance/my-clients error:', err);
    res.status(500).json({ message: 'Failed to fetch finance data' });
  }
});

// ── GET /api/finance/vendor-costs?month=M&year=Y
router.get('/vendor-costs', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const costs = await VendorCost.find({ month, year }).sort({ carrier: 1, vendorName: 1 });
    res.json(costs);
  } catch (err) {
    console.error('GET /finance/vendor-costs error:', err);
    res.status(500).json({ message: 'Failed to fetch vendor costs' });
  }
});

// ── PUT /api/finance/vendor-costs  — batch upsert
router.put('/vendor-costs', authorize('admin'), async (req, res) => {
  try {
    const { month, year, costs } = req.body;

    if (!month || !year || !Array.isArray(costs)) {
      return res.status(400).json({ message: 'month, year, and costs[] are required' });
    }

    // Delete all existing costs for this month/year and replace
    await VendorCost.deleteMany({ month, year });

    if (costs.length > 0) {
      const docs = costs
        .filter(c => c.carrier && c.costPerLabelUSD >= 0)
        .map(c => ({
          carrier:        c.carrier,
          vendorName:     c.vendorName || null,
          month,
          year,
          costPerLabelUSD: c.costPerLabelUSD,
          setBy:          req.user._id,
        }));
      await VendorCost.insertMany(docs);
    }

    const updated = await VendorCost.find({ month, year }).sort({ carrier: 1, vendorName: 1 });
    res.json(updated);
  } catch (err) {
    console.error('PUT /finance/vendor-costs error:', err);
    res.status(500).json({ message: 'Failed to save vendor costs' });
  }
});

// ── PATCH /api/finance/row-status  — update status/note for one row
router.patch('/row-status', authorize('admin'), async (req, res) => {
  try {
    const { clientId, carrier, month, year, status, note } = req.body;

    if (!clientId || !carrier || !month || !year) {
      return res.status(400).json({ message: 'clientId, carrier, month, year are required' });
    }

    const doc = await ClientFinanceStatus.findOneAndUpdate(
      { client: clientId, carrier, month, year },
      { status, note: note ?? '', updatedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(doc);
  } catch (err) {
    console.error('PATCH /finance/row-status error:', err);
    res.status(500).json({ message: 'Failed to update row status' });
  }
});

// ── GET /api/finance/manifest-vendors  — vendor names per carrier for cost modal
router.get('/manifest-vendors', authorize('admin'), async (req, res) => {
  try {
    const vendors = await Vendor.find({ isActive: true, carrier: { $ne: 'USPS' } }).select('name carrier');

    const byCarrier = {};
    for (const v of vendors) {
      if (!byCarrier[v.carrier]) byCarrier[v.carrier] = [];
      byCarrier[v.carrier].push(v.name);
    }
    for (const carrier of Object.keys(byCarrier)) {
      byCarrier[carrier].sort();
    }

    res.json(byCarrier);
  } catch (err) {
    console.error('GET /finance/manifest-vendors error:', err);
    res.status(500).json({ message: 'Failed to fetch manifest vendors' });
  }
});

// ── GET /api/finance/export?month=M&year=Y  — CSV download (admin)
router.get('/export', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const clients = await User.find({ role: { $in: ['user', 'reseller'] } }).select('_id');
    const rows    = await buildFinanceRows(clients.map(c => c._id), month, year);

    const config = await SalesConfig.getConfig();
    const { rate: pkrRate } = await getUsdToPkrRate(config.usdToPkrRate || 280);

    const headers = [
      'Source', 'S P', 'Client Email', 'Client Name', 'Carrier',
      'Total Labels', 'Paid Labels', 'Unpaid Labels',
      'Status', 'Rate (USD)',
      'Total Amount (USD)', 'Paid by Client (USD)', 'To Be Paid (USD)', 'Difference (USD)',
      'Total Amount (PKR)', 'Paid by Client (PKR)', 'Difference (PKR)',
      'Vendor Cost (USD)', 'Profit (USD)',
      'Note',
    ];

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const csvRows = rows.map(r => [
      r.source,
      r.spInitials,
      r.clientEmail,
      r.clientName,
      r.carrier,
      r.monthLabels,
      r.paidLabels,
      r.unpaidLabels,
      r.status,
      r.clientRate.toFixed(3),
      r.totalAmountUSD.toFixed(2),
      r.paidByClientUSD.toFixed(2),
      Math.max(0, r.totalAmountUSD - r.paidByClientUSD).toFixed(2),
      r.differenceUSD.toFixed(2),
      Math.round(r.totalAmountUSD  * pkrRate),
      Math.round(r.paidByClientUSD * pkrRate),
      Math.round(r.differenceUSD   * pkrRate),
      r.vendorCostUSD.toFixed(2),
      r.profitUSD.toFixed(2),
      r.note,
    ].map(escape).join(','));

    const csv = [headers.map(escape).join(','), ...csvRows].join('\r\n');

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="finance_${MONTHS[month-1]}_${year}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /finance/export error:', err);
    res.status(500).json({ message: 'Failed to generate export' });
  }
});

module.exports = router;
