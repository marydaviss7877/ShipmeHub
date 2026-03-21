const express = require('express');
const { body, validationResult } = require('express-validator');
const Vendor = require('../models/Vendor');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

const router  = express.Router();

// ── GET /api/carriers ─────────────────────────────────────────
// Returns vendors that are visible to the current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role, _id } = req.user;

    let filter = { isActive: true, visibleToRoles: role };
    // If specific user restrictions exist, add them
    const vendors = await Vendor.find(filter).sort({ carrier: 1, name: 1 });

    // Group by carrier for easier frontend rendering
    const grouped = {};
    const ORDER = ['USPS', 'UPS', 'FedEx', 'DHL'];
    ORDER.forEach(c => { grouped[c] = []; });

    vendors.forEach(v => {
      if (grouped[v.carrier]) grouped[v.carrier].push(v);
    });

    res.json({ carriers: grouped });
  } catch (error) {
    console.error('Get carriers error:', error);
    res.status(500).json({ message: 'Server error getting carriers' });
  }
});

// ── GET /api/carriers/live ────────────────────────────────────
// Proxies ShippersHub get_my_carriers (admin only)
router.get('/live', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const carriers = await shippershub.getMyCarriers();
    res.json({ carriers });
  } catch (error) {
    console.error('Get live carriers error:', error);
    res.status(502).json({ message: `ShippersHub error: ${error.message}` });
  }
});

// ── GET /api/carriers/live/:carrierId/vendors ─────────────────
// Proxies ShippersHub get_my_vendors (admin only)
router.get('/live/:carrierId/vendors', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendors = await shippershub.getMyVendors(req.params.carrierId);
    res.json({ vendors });
  } catch (error) {
    console.error('Get live vendors error:', error);
    res.status(502).json({ message: `ShippersHub error: ${error.message}` });
  }
});

module.exports = router;
