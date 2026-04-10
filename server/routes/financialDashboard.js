const express = require('express');
const router  = express.Router();

const { authenticateToken, authorize } = require('../middleware/auth');
const { getUsdToPkrRate }              = require('../services/exchangeRateService');

const CashBookEntry     = require('../models/CashBookEntry');
const EquityPartner     = require('../models/EquityPartner');
const Label             = require('../models/Label');
const ManifestJob       = require('../models/ManifestJob');
const PaymentLog        = require('../models/PaymentLog');
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
      partners,
      cashbookDebits,
      cashbookCredits,
      allWallets,
    ] = await Promise.all([
      getUsdToPkrRate(280),
      User.find({ role: 'user' }).select('_id source firstName lastName email').lean(),
      VendorCost.find({ month, year }).lean(),
      EquityPartner.find({ isActive: true }).lean(),
      CashBookEntry.find({ entryType: 'debit',  date: { $gte: start, $lt: end } })
        .populate('category', 'name type').populate('wallet', 'name').lean(),
      CashBookEntry.find({ entryType: 'credit', date: { $gte: start, $lt: end } })
        .populate('category', 'name type').populate('wallet', 'name').lean(),
      Wallet.find().lean(),
    ]);

    const clientIds    = allClients.map(c => c._id);
    const walletMap    = Object.fromEntries(allWallets.map(w => [w._id.toString(), w.name]));

    // ── PHASE 2: batch aggregations in parallel ───────────────────────────────
    const [
      totalPayAgg,
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
    const netProfitPKR = totalRevenuePKR - totalVendorCostPKR - totalExpensesPKR;
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
        operatingCostPKR: advertisingExpensePKR,
        profitPKR:        (orgPayAgg[0]?.totalUSD || 0) * rate,
      },
      paidAds: {
        revenueUSD:       paidPayAgg[0]?.totalUSD || 0,
        revenuePKR:       (paidPayAgg[0]?.totalUSD || 0) * rate,
        operatingCostPKR: advertisingExpensePKR,
        profitPKR:        ((paidPayAgg[0]?.totalUSD || 0) * rate) - advertisingExpensePKR,
      },
    };

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
        totalExpensesPKR:   Math.round(totalExpensesPKR),
        netProfitPKR:       Math.round(netProfitPKR),
        totalLabels,
        paidLabels:         rate > 0 ? Math.round(totalRevenuePKR / rate) : 0,
      },
      equityDistribution,
      revenueBySource,
      carrierCostDistribution,
      vendorCostDistribution: vendorCostDetails,
      walletSummary,
      accountSummary: {
        totalCreditsPKR: totalCashbookCreditsPKR,
        totalDebitsPKR:  totalExpensesPKR,
        netFlowPKR:      totalCashbookCreditsPKR - totalExpensesPKR,
      },
      expenseBreakdown,
    });
  } catch (err) {
    console.error('[FinancialDashboard] GET /:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
