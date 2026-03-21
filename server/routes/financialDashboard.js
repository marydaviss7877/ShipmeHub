const express = require('express');
const router  = express.Router();

const { authenticateToken, authorize } = require('../middleware/auth');
const { getUsdToPkrRate }              = require('../services/exchangeRateService');

const CashBookEntry     = require('../models/CashBookEntry');
const EquityPartner     = require('../models/EquityPartner');
const Label             = require('../models/Label');
const ManifestJob       = require('../models/ManifestJob');
const PaymentLog        = require('../models/PaymentLog');
const SalesAgentProfile = require('../models/SalesAgentProfile');
const User              = require('../models/User');
const VendorCost        = require('../models/VendorCost');
const Wallet            = require('../models/Wallet');

// GET /api/financial-dashboard?month=M&year=Y
router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month,     1);

    // ── PHASE 1: all independent queries in parallel ─────────────────────────
    const [
      { rate },
      allClients,
      vendorCosts,
      agentProfiles,
      partners,
      cashbookDebits,
      cashbookCredits,
      allWallets,
    ] = await Promise.all([
      getUsdToPkrRate(280),
      User.find({ role: 'user' }).select('_id source firstName lastName email').lean(),
      VendorCost.find({ month, year }).lean(),
      SalesAgentProfile.find()
        .populate('user', '_id firstName lastName email clients')
        .lean(),
      EquityPartner.find({ isActive: true }).lean(),
      CashBookEntry.find({ entryType: 'debit',  date: { $gte: start, $lt: end } })
        .populate('category', 'name type').populate('wallet', 'name').lean(),
      CashBookEntry.find({ entryType: 'credit', date: { $gte: start, $lt: end } })
        .populate('category', 'name type').populate('wallet', 'name').lean(),
      Wallet.find().lean(),
    ]);

    const clientIds    = allClients.map(c => c._id);
    const walletMap    = Object.fromEntries(allWallets.map(w => [w._id.toString(), w.name]));

    // Build agent → clientId[] map from populated user.clients
    // agentProfiles[].user.clients is an array of ObjectIds
    const agentClientMap = {}; // agentProfileId → [clientId]
    for (const profile of agentProfiles) {
      if (!profile.user) continue;
      const userDoc = await User.findById(profile.user._id || profile.user)
        .select('clients').lean();
      agentClientMap[profile._id.toString()] = (userDoc?.clients || []).map(String);
    }

    // All client IDs that belong to any agent (flat)
    const allAgentClientIds = [
      ...new Set(Object.values(agentClientMap).flat()),
    ];

    // ── PHASE 2: batch aggregations in parallel ───────────────────────────────
    const [
      totalPayAgg,
      perUserPayAgg,
      perUserCarrierLabelAgg,
      perUserCarrierMfAgg,
      carrierLabelAgg,
      carrierMfAgg,
      orgPayAgg,
      paidPayAgg,
      walletPayAgg,
    ] = await Promise.all([
      // Total payment for period (all clients)
      PaymentLog.aggregate([
        { $match: { user: { $in: clientIds }, date: { $gte: start, $lt: end } } },
        { $group: { _id: null, totalUSD: { $sum: '$amount' } } },
      ]),
      // Payment per client (for sales team breakdown)
      PaymentLog.aggregate([
        { $match: { user: { $in: clientIds }, date: { $gte: start, $lt: end } } },
        { $group: { _id: '$user', totalUSD: { $sum: '$amount' } } },
      ]),
      // Labels per client per carrier
      Label.aggregate([
        { $match: { user: { $in: clientIds }, createdAt: { $gte: start, $lt: end }, status: 'generated' } },
        { $group: { _id: { user: '$user', carrier: '$carrier' }, count: { $sum: 1 } } },
      ]),
      // ManifestJobs per client per carrier
      ManifestJob.aggregate([
        { $match: { user: { $in: clientIds }, createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: { _id: { user: '$user', carrier: '$carrier' }, count: { $sum: '$userBilling.labelCount' } } },
      ]),
      // Total labels per carrier (for overall cost distribution)
      Label.aggregate([
        { $match: { user: { $in: clientIds }, createdAt: { $gte: start, $lt: end }, status: 'generated' } },
        { $group: { _id: '$carrier', count: { $sum: 1 } } },
      ]),
      ManifestJob.aggregate([
        { $match: { user: { $in: clientIds }, createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: { _id: '$carrier', count: { $sum: '$userBilling.labelCount' } } },
      ]),
      // Organic client payments
      PaymentLog.aggregate([
        { $match: { user: { $in: allClients.filter(c => c.source === 'Organic').map(c => c._id) }, date: { $gte: start, $lt: end } } },
        { $group: { _id: null, totalUSD: { $sum: '$amount' } } },
      ]),
      // Paid Ads client payments
      PaymentLog.aggregate([
        { $match: { user: { $in: allClients.filter(c => c.source === 'Paid Ads').map(c => c._id) }, date: { $gte: start, $lt: end } } },
        { $group: { _id: null, totalUSD: { $sum: '$amount' } } },
      ]),
      // Wallet payment aggregation
      PaymentLog.aggregate([
        { $match: { date: { $gte: start, $lt: end }, wallet: { $ne: null } } },
        { $group: { _id: '$wallet', totalUSD: { $sum: '$amount' } } },
      ]),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────────

    // perUserPayMap: userId → totalUSD
    const perUserPayMap = Object.fromEntries(
      perUserPayAgg.map(r => [r._id.toString(), r.totalUSD])
    );

    // perUserCarrierMap: `${userId}:${carrier}` → count
    const perUserCarrierMap = {};
    [...perUserCarrierLabelAgg, ...perUserCarrierMfAgg].forEach(r => {
      const key = `${r._id.user}:${r._id.carrier}`;
      perUserCarrierMap[key] = (perUserCarrierMap[key] || 0) + r.count;
    });

    // carrierCounts: carrier → total labels
    const carrierCounts = {};
    [...carrierLabelAgg, ...carrierMfAgg].forEach(({ _id, count }) => {
      carrierCounts[_id] = (carrierCounts[_id] || 0) + count;
    });

    // ── Revenue & labels ──────────────────────────────────────────────────────
    const totalRevenueUSD = totalPayAgg[0]?.totalUSD || 0;
    const totalRevenuePKR = totalRevenueUSD * rate;
    const totalLabels     = Object.values(carrierCounts).reduce((s, c) => s + c, 0);

    // ── Vendor costs ──────────────────────────────────────────────────────────
    let totalVendorCostUSD = 0;
    const vendorCostDetails = [];
    vendorCosts.forEach(vc => {
      const count       = carrierCounts[vc.carrier] || 0;
      const totalCostUSD = count * vc.costPerLabelUSD;
      totalVendorCostUSD += totalCostUSD;
      vendorCostDetails.push({
        carrier:         vc.carrier,
        vendorName:      vc.vendorName || 'ShippersHub (USPS)',
        labelCount:      count,
        costPerLabelUSD: vc.costPerLabelUSD,
        totalCostUSD,
        totalCostPKR:    totalCostUSD * rate,
      });
    });
    const totalVendorCostPKR = totalVendorCostUSD * rate;

    // ── Salary expense ────────────────────────────────────────────────────────
    let totalSalaryPKR = 0;
    const salarySummary = agentProfiles.map(profile => {
      const monthLogs = (profile.salaryLogs || []).filter(
        l => l.month === month && l.year === year
      );
      const totalPaid = monthLogs.reduce((s, l) => s + (l.totalPaid || 0), 0);
      totalSalaryPKR += totalPaid;
      return {
        agentId:      profile._id,
        agentName:    profile.user ? `${profile.user.firstName} ${profile.user.lastName}` : 'Unknown',
        baseSalaryPKR: profile.baseSalaryPKR,
        totalPaid,
        remainingDue: Math.max(0, (profile.baseSalaryPKR || 0) - totalPaid),
        logs:         monthLogs,
      };
    });

    // ── Cash book totals ──────────────────────────────────────────────────────
    const totalExpensesPKR        = cashbookDebits.reduce((s, e) => s + e.amountPKR, 0);
    const totalCashbookCreditsPKR = cashbookCredits.reduce((s, e) => s + e.amountPKR, 0);

    const expenseByCategoryMap = {};
    cashbookDebits.forEach(e => {
      const key = e.category?.name || 'Uncategorized';
      if (!expenseByCategoryMap[key]) {
        expenseByCategoryMap[key] = { category: key, type: e.category?.type || 'other', totalPKR: 0, count: 0 };
      }
      expenseByCategoryMap[key].totalPKR += e.amountPKR;
      expenseByCategoryMap[key].count++;
    });
    const expenseBreakdown = Object.values(expenseByCategoryMap).sort((a, b) => b.totalPKR - a.totalPKR);

    // ── Net profit & equity ───────────────────────────────────────────────────
    const netProfitPKR = totalRevenuePKR - totalVendorCostPKR - totalSalaryPKR - totalExpensesPKR;
    const equityDistribution = partners.map(p => ({
      name:             p.name,
      ownershipPercent: p.ownershipPercent,
      profitSharePKR:   (netProfitPKR * p.ownershipPercent) / 100,
    }));

    // ── Revenue by source ─────────────────────────────────────────────────────
    const advertisingExpensePKR = cashbookDebits
      .filter(e => e.category?.type === 'advertising')
      .reduce((s, e) => s + e.amountPKR, 0);

    const revenueBySource = {
      organic: {
        revenueUSD:       orgPayAgg[0]?.totalUSD || 0,
        revenuePKR:       (orgPayAgg[0]?.totalUSD || 0) * rate,
        operatingCostPKR: totalSalaryPKR,
        profitPKR:        ((orgPayAgg[0]?.totalUSD || 0) * rate) - totalSalaryPKR,
      },
      paidAds: {
        revenueUSD:       paidPayAgg[0]?.totalUSD || 0,
        revenuePKR:       (paidPayAgg[0]?.totalUSD || 0) * rate,
        operatingCostPKR: advertisingExpensePKR,
        profitPKR:        ((paidPayAgg[0]?.totalUSD || 0) * rate) - advertisingExpensePKR,
      },
    };

    // ── Sales team (pure JS, no extra DB calls) ───────────────────────────────
    const salesTeam = agentProfiles
      .filter(p => p.user)
      .map(profile => {
        const pid          = profile._id.toString();
        const agentClients = agentClientMap[pid] || [];

        // Sum client payments from pre-fetched map
        const agentRevUSD = agentClients.reduce(
          (s, cid) => s + (perUserPayMap[cid] || 0), 0
        );

        // Sum vendor costs from pre-fetched carrier-user map
        const agentCarrierCounts = {};
        agentClients.forEach(cid => {
          vendorCosts.forEach(vc => {
            const key   = `${cid}:${vc.carrier}`;
            const count = perUserCarrierMap[key] || 0;
            agentCarrierCounts[vc.carrier] = (agentCarrierCounts[vc.carrier] || 0) + count;
          });
        });
        const agentVendorCostUSD = vendorCosts.reduce(
          (s, vc) => s + (agentCarrierCounts[vc.carrier] || 0) * vc.costPerLabelUSD, 0
        );

        const monthLogs     = (profile.salaryLogs || []).filter(l => l.month === month && l.year === year);
        const salaryCostPKR = monthLogs.reduce((s, l) => s + (l.totalPaid || 0), 0);
        const agentRevPKR   = agentRevUSD * rate;
        const vendorPKR     = agentVendorCostUSD * rate;

        return {
          agentId:       profile._id,
          agentName:     `${profile.user.firstName || ''} ${profile.user.lastName || ''}`.trim(),
          clientCount:   agentClients.length,
          revenueUSD:    agentRevUSD,
          revenuePKR:    agentRevPKR,
          salaryCostPKR,
          vendorCostPKR: vendorPKR,
          netProfitPKR:  agentRevPKR - salaryCostPKR - vendorPKR,
        };
      });

    // ── Wallet summary ────────────────────────────────────────────────────────
    const cashbookByWallet = {};
    [...cashbookDebits, ...cashbookCredits].forEach(e => {
      const wid   = e.wallet?._id?.toString() || 'unassigned';
      const wname = e.wallet?.name || 'No Wallet';
      if (!cashbookByWallet[wid]) cashbookByWallet[wid] = { walletName: wname, credits: 0, debits: 0 };
      if (e.entryType === 'credit') cashbookByWallet[wid].credits += e.amountPKR;
      else cashbookByWallet[wid].debits += e.amountPKR;
    });

    const walletSummary = walletPayAgg.map(w => {
      const wid = w._id.toString();
      const cb  = cashbookByWallet[wid] || { credits: 0, debits: 0 };
      return {
        walletId:         wid,
        walletName:       walletMap[wid] || 'Unknown',
        totalReceivedUSD: w.totalUSD,
        totalReceivedPKR: w.totalUSD * rate,
        manualCreditsPKR: cb.credits,
        manualDebitsPKR:  cb.debits,
        netFlowPKR:       (w.totalUSD * rate) + cb.credits - cb.debits,
      };
    });

    // ── Carrier cost distribution ─────────────────────────────────────────────
    const carrierCostDistribution = Object.entries(carrierCounts)
      .map(([carrier, count]) => {
        const vc      = vendorCosts.find(v => v.carrier === carrier);
        const costUSD = count * (vc?.costPerLabelUSD || 0);
        return {
          carrier,
          labelCount:   count,
          costUSD,
          costPKR:      costUSD * rate,
          sharePercent: totalLabels > 0 ? ((count / totalLabels) * 100).toFixed(1) : '0',
        };
      })
      .sort((a, b) => b.labelCount - a.labelCount);

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      period:       { month, year },
      exchangeRate: rate,
      kpis: {
        totalRevenuePKR:    Math.round(totalRevenuePKR),
        totalRevenueUSD,
        totalVendorCostPKR: Math.round(totalVendorCostPKR),
        totalSalaryPKR:     Math.round(totalSalaryPKR),
        totalExpensesPKR:   Math.round(totalExpensesPKR),
        netProfitPKR:       Math.round(netProfitPKR),
        totalLabels,
        paidLabels:         rate > 0 ? Math.round(totalRevenuePKR / rate) : 0,
      },
      equityDistribution,
      revenueBySource,
      salesTeam,
      carrierCostDistribution,
      vendorCostDistribution: vendorCostDetails,
      walletSummary,
      accountSummary: {
        totalCreditsPKR: totalCashbookCreditsPKR,
        totalDebitsPKR:  totalExpensesPKR,
        netFlowPKR:      totalCashbookCreditsPKR - totalExpensesPKR,
      },
      expenseBreakdown,
      salarySummary,
    });
  } catch (err) {
    console.error('[FinancialDashboard] GET /:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
