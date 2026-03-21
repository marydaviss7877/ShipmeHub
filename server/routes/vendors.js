const express = require('express');
const { body, validationResult } = require('express-validator');
const Vendor = require('../models/Vendor');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

const router = express.Router();

// ── GET /api/vendors ──────────────────────────────────────────
// Admin: list all vendors | User/Reseller: their visible vendors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { isActive: true, visibleToRoles: req.user.role };
    const vendors = await Vendor.find(filter).sort({ carrier: 1, name: 1 });
    res.json({ vendors });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors ─────────────────────────────────────────
// Admin: create a vendor
router.post('/', authenticateToken, authorize('admin'), [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('carrier').isIn(['USPS', 'UPS', 'FedEx', 'DHL']).withMessage('Invalid carrier'),
  body('rate').isFloat({ min: 0 }).withMessage('Rate must be a non-negative number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const {
      name, carrier, rate, rateMin, rateMax,
      shippershubCarrierId, shippershubVendorId,
      shippingService, visibleToRoles, isActive, description, source,
      vendorContactEmail, vendorPortalEmail, vendorPortalPassword,
      vendorPortalIsActive, vendorRate, vendorType,
    } = req.body;

    const vendor = new Vendor({
      name, carrier, rate,
      vendorType:           vendorType || 'api',
      rateMin:              rateMin || null,
      rateMax:              rateMax || null,
      shippershubCarrierId: shippershubCarrierId || null,
      shippershubVendorId:  shippershubVendorId  || null,
      shippingService:      shippingService || '',
      visibleToRoles:       visibleToRoles  || ['admin', 'reseller', 'user'],
      isActive:             isActive !== undefined ? isActive : true,
      description:          description || '',
      source:               source || 'shippershub',
      vendorContactEmail:   vendorContactEmail   || '',
      vendorPortalEmail:    vendorPortalEmail     || undefined,
      vendorPortalIsActive: vendorPortalIsActive  || false,
      vendorRate:           vendorRate            || 0,
    });

    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save will hash
    }

    await vendor.save();

    res.status(201).json({ message: 'Vendor created successfully', vendor });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ message: 'Server error creating vendor' });
  }
});

// ── PUT /api/vendors/:id ──────────────────────────────────────
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Apply all fields from request body
    const { vendorPortalPassword, ...rest } = req.body;

    Object.assign(vendor, rest);

    // Only update password if a new one was explicitly provided
    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save hook will hash it
    }

    await vendor.save(); // triggers bcrypt pre-save hook
    res.json({ message: 'Vendor updated', vendor });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/vendors/:id ───────────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors/import-from-shippershub ─────────────────
// Admin: full sync — creates new, updates existing, deactivates removed
router.post('/import-from-shippershub', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const carriers = await shippershub.getMyCarriers();

    // Collect all vendor IDs currently available in ShippersHub
    const liveVendorIds = [];
    const created  = [];
    const updated  = [];

    for (const carrier of carriers) {
      const vendors = await shippershub.getMyVendors(carrier._id);
      for (const v of vendors) {
        liveVendorIds.push(v._id);

        const carrierName = carrier.name.toUpperCase().includes('USPS')  ? 'USPS'
                          : carrier.name.toUpperCase().includes('UPS')   ? 'UPS'
                          : carrier.name.toUpperCase().includes('FEDEX') ? 'FedEx' : 'DHL';

        const existing = await Vendor.findOne({ shippershubVendorId: v._id });
        if (!existing) {
          await Vendor.create({
            name:                 v.name,
            carrier:              carrierName,
            shippershubCarrierId: carrier._id,
            shippershubVendorId:  v._id,
            shippingService:      v.shippingService || '',
            rate:                 v.rate || 0,
            isActive:             v.status === 'active',
            source:               'shippershub'
          });
          created.push(v.name);
        } else {
          // Update name & status to match ShippersHub, preserve admin-set rate
          existing.name            = v.name;
          existing.shippingService = v.shippingService || existing.shippingService;
          existing.isActive        = v.status === 'active';
          await existing.save();
          updated.push(v.name);
        }
      }
    }

    // Deactivate any ShippersHub vendor no longer returned by the API
    const deactivated = await Vendor.updateMany(
      { source: 'shippershub', shippershubVendorId: { $nin: liveVendorIds } },
      { isActive: false }
    );

    res.json({
      message: `Sync complete — ${created.length} added, ${updated.length} updated, ${deactivated.modifiedCount} deactivated`,
      created, updated
    });
  } catch (error) {
    console.error('Import ShippersHub vendors error:', error);
    res.status(502).json({ message: `ShippersHub error: ${error.message}` });
  }
});

module.exports = router;
