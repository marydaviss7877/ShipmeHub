const express = require('express');
const router = express.Router();

const { authenticateToken, authorize } = require('../middleware/auth');

const Label               = require('../models/Label');
const ManifestJob         = require('../models/ManifestJob');
const PaymentLog          = require('../models/PaymentLog');
const User                = require('../models/User');
const ClientFinanceStatus = require('../models/ClientFinanceStatus');
const { getUsdToPkrRate } = require('../services/exchangeRateService');

// USPS non-manifest (API) labels cost us $0.30 each
const USPS_API_COST_PER_LABEL = 0.30;

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Build finance rows for the given clientIds, month, year. */
async function buildFinanceRows(clientIds, month, year) {
  if (!clientIds || clientIds.length === 0) return [];

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month,     1);

  const [
    apiLabelAgg,  // Label: sum(price) + count per (user, carrier)
    mfLabelAgg,   // ManifestJob: sum(userBilling.totalAmount) + count per (user, carrier)
    collectedAgg, // PaymentLog: monthly collected per user
    statusDocs,   // ClientFinanceStatus
  ] = await Promise.all([
    Label.aggregate([
      {
        $match: {
          user: { $in: clientIds },
          createdAt: { $gte: monthStart, $lt: monthEnd },
          status: 'generated',
        },
      },
      {
        $group: {
          _id: { user: '$user', carrier: '$carrier' },
          totalAmount: { $sum: '$price' },
          count:       { $sum: 1 },
        },
      },
    ]),
    ManifestJob.aggregate([
      {
        $match: {
          user: { $in: clientIds },
          createdAt: { $gte: monthStart, $lt: monthEnd },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: { user: '$user', carrier: '$carrier' },
          totalAmount: { $sum: '$userBilling.totalAmount' },
          count:       { $sum: '$userBilling.labelCount' },
        },
      },
    ]),
    PaymentLog.aggregate([
      {
        $match: {
          user: { $in: clientIds },
          date: { $gte: monthStart, $lt: monthEnd },
        },
      },
      { $group: { _id: '$user', collected: { $sum: '$amount' } } },
    ]),
    ClientFinanceStatus.find({ client: { $in: clientIds }, month, year }),
  ]);

  // ── Build lookup maps ─────────────────────────────────────────────────────

  // rowMap: `userId_carrier` → { userId, carrier, labelCount, totalAmount, uspsApiCount }
  const rowMap = {};

  for (const r of apiLabelAgg) {
    const k = `${r._id.user}_${r._id.carrier}`;
    if (!rowMap[k]) {
      rowMap[k] = { userId: r._id.user.toString(), carrier: r._id.carrier, labelCount: 0, totalAmount: 0, uspsApiCount: 0 };
    }
    rowMap[k].labelCount  += r.count;
    rowMap[k].totalAmount += r.totalAmount;
    if (r._id.carrier === 'USPS') rowMap[k].uspsApiCount += r.count; // API (non-manifest) count
  }

  for (const r of mfLabelAgg) {
    const k = `${r._id.user}_${r._id.carrier}`;
    if (!rowMap[k]) {
      rowMap[k] = { userId: r._id.user.toString(), carrier: r._id.carrier, labelCount: 0, totalAmount: 0, uspsApiCount: 0 };
    }
    rowMap[k].labelCount  += r.count;
    rowMap[k].totalAmount += r.totalAmount;
    // manifest labels do NOT count toward uspsApiCount
  }

  // collectedMap: userId → monthly collected USD
  const collectedMap = {};
  for (const r of collectedAgg) {
    collectedMap[r._id.toString()] = r.collected;
  }

  // userTotalMap: userId → total amount across all carriers this month
  const userTotalMap = {};
  for (const data of Object.values(rowMap)) {
    userTotalMap[data.userId] = (userTotalMap[data.userId] || 0) + data.totalAmount;
  }

  // statusMap: `userId_carrier` → { status, note, _id }
  const statusMap = {};
  for (const s of statusDocs) {
    statusMap[`${s.client}_${s.carrier}`] = { status: s.status, note: s.note, _id: s._id };
  }

  // ── Assemble rows ─────────────────────────────────────────────────────────

  const rows = [];

  for (const [, data] of Object.entries(rowMap)) {
    if (data.labelCount <= 0) continue;

    const collected  = collectedMap[data.userId] || 0;
    const userTotal  = userTotalMap[data.userId]  || 0;
    const difference = userTotal - collected; // positive = client owes us, negative = overpaid

    // USPS API cost: only for USPS rows (non-manifest labels × $0.30)
    const usdCost = data.carrier === 'USPS'
      ? Math.round(data.uspsApiCount * USPS_API_COST_PER_LABEL * 100) / 100
      : null;

    const statusInfo    = statusMap[`${data.userId}_${data.carrier}`] || {};
    const defaultStatus = difference <= 0.01 ? 'Clear' : 'Pending';

    rows.push({
      clientId:    data.userId,
      carrier:     data.carrier,
      labelCount:  Math.round(data.labelCount),
      totalAmount: Math.round(data.totalAmount * 100) / 100,
      collected:   Math.round(collected * 100) / 100,
      difference:  Math.round(difference * 100) / 100,
      usdCost,
      status:      statusInfo.status || defaultStatus,
      note:        statusInfo.note   || '',
      statusId:    statusInfo._id    || null,
    });
  }

  // Sort: carrier order, then most owed first
  const CARRIER_ORDER = { USPS: 0, UPS: 1, FedEx: 2, DHL: 3 };
  rows.sort((a, b) =>
    (CARRIER_ORDER[a.carrier] ?? 9) - (CARRIER_ORDER[b.carrier] ?? 9) ||
    b.difference - a.difference
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
    row.clientName  = info.name   || '';
    row.clientEmail = info.email  || '';
    row.source      = info.source || '';
  }

  return rows;
}

/** Compute summary KPIs from a rows array. */
function computeSummary(rows) {
  // collected/difference are per-user values repeated across carrier rows — de-dupe by clientId
  const seenClients = new Set();
  let totalCollected = 0;
  for (const row of rows) {
    if (!seenClients.has(row.clientId)) {
      seenClients.add(row.clientId);
      totalCollected += row.collected;
    }
  }
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  return {
    totalLabels:  rows.reduce((s, r) => s + r.labelCount, 0),
    totalAmount:  Math.round(totalAmount * 100) / 100,
    collected:    Math.round(totalCollected * 100) / 100,
    difference:   Math.round((totalAmount - totalCollected) * 100) / 100,
    totalUsdCost: Math.round(rows.reduce((s, r) => s + (r.usdCost || 0), 0) * 100) / 100,
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

    const clients   = await User.find({ role: { $in: ['user', 'reseller'] } }).select('_id');
    const clientIds = clients.map(c => c._id);

    const rows    = await buildFinanceRows(clientIds, month, year);
    const summary = computeSummary(rows);

    const { rate: usdToPkrRate, source: rateSource } = await getUsdToPkrRate(280);

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
      const me  = await User.findById(req.user._id).select('clients');
      clientIds = me?.clients || [];
    }

    const rows    = await buildFinanceRows(clientIds, month, year);
    const summary = computeSummary(rows);

    // Resellers see all columns except source and usdCost (our internal cost)
    const limitedRows = rows.map(({ source, usdCost, ...rest }) => rest);
    const limitedSummary = {
      totalLabels: summary.totalLabels,
      totalAmount: summary.totalAmount,
      collected:   summary.collected,
      difference:  summary.difference,
    };

    res.json({ rows: limitedRows, summary: limitedSummary, month, year });
  } catch (err) {
    console.error('GET /finance/my-clients error:', err);
    res.status(500).json({ message: 'Failed to fetch finance data' });
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

// ── GET /api/finance/export?month=M&year=Y  — CSV download (admin)
router.get('/export', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const clients = await User.find({ role: { $in: ['user', 'reseller'] } }).select('_id');
    const rows    = await buildFinanceRows(clients.map(c => c._id), month, year);

    const { rate: pkrRate } = await getUsdToPkrRate(280);

    const headers = [
      'Source', 'Client Email', 'Client Name', 'Carrier',
      'Total Labels',
      'Total Amount (USD)', 'Collected (USD)', 'Difference (USD)',
      'Total Amount (PKR)', 'Collected (PKR)', 'Difference (PKR)',
      'USPS Cost (USD)',
      'Status', 'Note',
    ];

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const csvRows = rows.map(r => [
      r.source,
      r.clientEmail,
      r.clientName,
      r.carrier,
      r.labelCount,
      r.totalAmount.toFixed(2),
      r.collected.toFixed(2),
      r.difference.toFixed(2),
      Math.round(r.totalAmount * pkrRate),
      Math.round(r.collected   * pkrRate),
      Math.round(r.difference  * pkrRate),
      r.usdCost != null ? r.usdCost.toFixed(2) : '',
      r.status,
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
