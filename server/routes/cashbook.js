const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CashBookEntry = require('../models/CashBookEntry');
const PaymentLog = require('../models/PaymentLog');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const { authenticateToken, authorize } = require('../middleware/auth');
const { getUsdToPkrRate } = require('../services/exchangeRateService');

// GET /api/cashbook — list entries with optional filters
// Combines manual CashBookEntry records + all PaymentLog records (as credits)
router.get(
  '/',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const now = new Date();
      const month = parseInt(req.query.month) || now.getMonth() + 1;
      const year  = parseInt(req.query.year)  || now.getFullYear();

      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month,     1);

      const { entryType: typeFilter, wallet: walletFilter, category: categoryFilter } = req.query;

      // ── 1. CashBookEntry records ───────────────────────────────────────────
      const cbFilter = { date: { $gte: start, $lt: end } };
      if (typeFilter)     cbFilter.entryType = typeFilter;
      if (walletFilter)   cbFilter.wallet    = walletFilter;
      if (categoryFilter) cbFilter.category  = categoryFilter;

      const manualEntries = await CashBookEntry.find(cbFilter)
        .populate('wallet',    'name')
        .populate('category',  'name type')
        .populate('enteredBy', 'firstName lastName')
        .sort({ date: -1 })
        .lean();

      // ── 2. PaymentLog records (only when not filtering by debit/category) ──
      let paymentEntries = [];
      const skipPaymentLogs = typeFilter === 'debit' || !!categoryFilter;

      if (!skipPaymentLogs) {
        const { rate } = await getUsdToPkrRate(280);

        const plFilter = { date: { $gte: start, $lt: end } };
        if (walletFilter) plFilter.wallet = new mongoose.Types.ObjectId(walletFilter);

        const payLogs = await PaymentLog.find(plFilter)
          .populate('user',     'firstName lastName email')
          .populate('wallet',   'name')
          .populate('loggedBy', 'firstName lastName')
          .sort({ date: -1 })
          .lean();

        paymentEntries = payLogs.map(pl => ({
          _id:        pl._id,
          entryType:  'credit',
          amountPKR:  parseFloat((pl.amount * rate).toFixed(2)),
          amountUSD:  pl.amount,
          wallet:     pl.wallet || null,
          category:   null,
          description: pl.note
            ? pl.note
            : pl.user
              ? `Payment from ${pl.user.firstName} ${pl.user.lastName}`
              : 'Client Payment',
          clientName: pl.user ? `${pl.user.firstName} ${pl.user.lastName}` : null,
          date:       pl.date,
          enteredBy:  pl.loggedBy || null,
          isAutoEntry: true,
          source:     'payment_log',
          screenshots: pl.screenshots || [],
        }));
      }

      // ── 3. Merge + sort by date desc ──────────────────────────────────────
      const allEntries = [...manualEntries, ...paymentEntries]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      // ── 4. Summary ────────────────────────────────────────────────────────
      const totalCredits = allEntries
        .filter(e => e.entryType === 'credit')
        .reduce((s, e) => s + e.amountPKR, 0);

      const totalDebits = allEntries
        .filter(e => e.entryType === 'debit')
        .reduce((s, e) => s + e.amountPKR, 0);

      res.json({
        entries: allEntries,
        summary: { totalCredits, totalDebits, netFlow: totalCredits - totalDebits },
      });
    } catch (err) {
      console.error('[CashBook] GET /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// GET /api/cashbook/wallet-summary — per-wallet summary for a period
router.get(
  '/wallet-summary',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const now = new Date();
      const month = parseInt(req.query.month) || now.getMonth() + 1;
      const year = parseInt(req.query.year) || now.getFullYear();

      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);

      // PaymentLog aggregation per wallet (USD)
      const paymentAgg = await PaymentLog.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            wallet: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$wallet',
            totalUSD: { $sum: '$amount' },
          },
        },
      ]);

      // CashBook credits per wallet
      const cashbookCreditAgg = await CashBookEntry.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            entryType: 'credit',
            wallet: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$wallet',
            totalCreditsPKR: { $sum: '$amountPKR' },
          },
        },
      ]);

      // CashBook debits per wallet
      const cashbookDebitAgg = await CashBookEntry.aggregate([
        {
          $match: {
            date: { $gte: start, $lt: end },
            entryType: 'debit',
            wallet: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$wallet',
            totalDebitsPKR: { $sum: '$amountPKR' },
          },
        },
      ]);

      // Fetch all wallets for names
      const allWallets = await Wallet.find().lean();
      const walletMap = {};
      allWallets.forEach(w => {
        walletMap[w._id.toString()] = w.name;
      });

      // Build maps for lookup
      const creditMap = {};
      cashbookCreditAgg.forEach(r => {
        creditMap[r._id.toString()] = r.totalCreditsPKR;
      });

      const debitMap = {};
      cashbookDebitAgg.forEach(r => {
        debitMap[r._id.toString()] = r.totalDebitsPKR;
      });

      // Collect all wallet IDs across all aggregations
      const walletIdSet = new Set();
      paymentAgg.forEach(r => walletIdSet.add(r._id.toString()));
      cashbookCreditAgg.forEach(r => walletIdSet.add(r._id.toString()));
      cashbookDebitAgg.forEach(r => walletIdSet.add(r._id.toString()));

      // Build payment map
      const paymentMap = {};
      paymentAgg.forEach(r => {
        paymentMap[r._id.toString()] = r.totalUSD;
      });

      const walletSummary = Array.from(walletIdSet).map(wid => {
        const totalCredits = creditMap[wid] || 0;
        const totalDebits = debitMap[wid] || 0;
        const totalReceivedUSD = paymentMap[wid] || 0;
        return {
          walletId: wid,
          walletName: walletMap[wid] || 'Unknown',
          totalCredits,
          totalDebits,
          netFlow: totalCredits - totalDebits,
          totalReceivedUSD,
        };
      });

      res.json(walletSummary);
    } catch (err) {
      console.error('[CashBook] GET /wallet-summary:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/cashbook — create manual entry
router.post(
  '/',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const { entryType, amountPKR, walletId, categoryId, description, date } = req.body;

      if (!entryType) {
        return res.status(400).json({ message: 'entryType is required' });
      }
      if (amountPKR === undefined || amountPKR === null) {
        return res.status(400).json({ message: 'amountPKR is required' });
      }

      const entry = new CashBookEntry({
        entryType,
        amountPKR,
        wallet: walletId || null,
        category: categoryId || null,
        description: description || '',
        date: date ? new Date(date) : new Date(),
        enteredBy: req.user._id,
        isAutoEntry: false,
      });

      await entry.save();

      const populated = await CashBookEntry.findById(entry._id)
        .populate('wallet', 'name')
        .populate('category', 'name type')
        .populate('enteredBy', 'firstName lastName')
        .lean();

      res.status(201).json(populated);
    } catch (err) {
      console.error('[CashBook] POST /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/cashbook/:id — update manual entry only
router.put(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const entry = await CashBookEntry.findById(req.params.id);

      if (!entry) {
        return res.status(404).json({ message: 'Cash book entry not found' });
      }
      if (entry.isAutoEntry) {
        return res.status(403).json({ message: 'Auto-generated entries cannot be edited' });
      }

      const { entryType, amountPKR, walletId, categoryId, description, date } = req.body;
      const updates = {};
      if (entryType !== undefined) updates.entryType = entryType;
      if (amountPKR !== undefined) updates.amountPKR = amountPKR;
      if (walletId !== undefined) updates.wallet = walletId || null;
      if (categoryId !== undefined) updates.category = categoryId || null;
      if (description !== undefined) updates.description = description;
      if (date !== undefined) updates.date = new Date(date);

      const updated = await CashBookEntry.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      )
        .populate('wallet', 'name')
        .populate('category', 'name type')
        .populate('enteredBy', 'firstName lastName')
        .lean();

      res.json(updated);
    } catch (err) {
      console.error('[CashBook] PUT /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/cashbook/:id — delete manual entry only
router.delete(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const entry = await CashBookEntry.findById(req.params.id);

      if (!entry) {
        return res.status(404).json({ message: 'Cash book entry not found' });
      }
      if (entry.isAutoEntry) {
        return res.status(403).json({ message: 'Auto-generated entries cannot be deleted' });
      }

      await CashBookEntry.findByIdAndDelete(req.params.id);
      res.json({ message: 'Entry deleted successfully' });
    } catch (err) {
      console.error('[CashBook] DELETE /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

module.exports = router;
