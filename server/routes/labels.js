const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');
const { body, validationResult } = require('express-validator');
const Label            = require('../models/Label');
const Vendor           = require('../models/Vendor');
const Balance          = require('../models/Balance');
const UserVendorAccess = require('../models/UserVendorAccess');
const ManifestJob      = require('../models/ManifestJob');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

// ── Helpers ───────────────────────────────────────────────────
const manifestRequestDir = path.join(__dirname, '../uploads/manifests/requests');
const labelsDir          = path.join(__dirname, '../uploads/labels');
const zipsDir            = path.join(__dirname, '../uploads/zips');
fs.mkdirSync(manifestRequestDir, { recursive: true });
fs.mkdirSync(labelsDir, { recursive: true });
fs.mkdirSync(zipsDir,   { recursive: true });

// Create a ZIP of PDF files using STORE (no recompression — preserves PDF bytes exactly)
function createZip(pdfPaths, zipFilename) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(zipsDir, zipFilename);
    const output  = fs.createWriteStream(zipPath);
    // level: 0 = STORE method — PDFs are already compressed internally,
    // re-compressing degrades nothing but wastes CPU and can increase size.
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    pdfPaths.forEach((p, i) => {
      if (p && fs.existsSync(p)) {
        archive.file(p, { name: `label-${i + 1}-${path.basename(p)}` });
      }
    });
    archive.finalize();
  });
}

function rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

const router = express.Router();

// ── POST /api/labels/single ───────────────────────────────────
// Generate a single label via ShippersHub, deduct balance
router.post('/single', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('from_name').notEmpty().withMessage('From name is required'),
  body('from_address1').notEmpty().withMessage('From address is required'),
  body('from_city').notEmpty().withMessage('From city is required'),
  body('from_state').notEmpty().withMessage('From state is required'),
  body('from_zip').notEmpty().withMessage('From zip is required'),
  body('to_name').notEmpty().withMessage('To name is required'),
  body('to_address1').notEmpty().withMessage('To address is required'),
  body('to_city').notEmpty().withMessage('To city is required'),
  body('to_state').notEmpty().withMessage('To state is required'),
  body('to_zip').notEmpty().withMessage('To zip is required'),
  body('weight').isFloat({ gt: 0 }).withMessage('Weight must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, ...labelFields } = req.body;

    // Load the vendor config
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    // Ensure user has access to this vendor and compute effective rate based on weight tiers
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    const weight = parseFloat(labelFields.weight);

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const matched = access.getRateForWeight(weight);
      if (matched === null) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `Weight ${weight} lbs is outside your allowed range. Allowed: ${ranges}.`,
        });
      }
    }

    const tierRate = isAdmin ? null : access.getRateForWeight(weight);
    const effectiveRate = tierRate !== null && tierRate !== undefined ? tierRate : vendor.rate;

    // Check user has sufficient balance
    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < effectiveRate) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${effectiveRate.toFixed(2)}, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // Call ShippersHub to generate label
    let shippershubResult = null;
    let trackingId = '';

    if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
      shippershubResult = await shippershub.createSingleLabel({
        carrier:  vendor.shippershubCarrierId,
        vendor:   vendor.shippershubVendorId,
        weight:   parseFloat(labelFields.weight),
        note:     labelFields.note || '',
        from_name:     labelFields.from_name,
        from_company:  labelFields.from_company || '',
        from_phone:    labelFields.from_phone || '',
        from_address1: labelFields.from_address1,
        from_address2: labelFields.from_address2 || '',
        from_city:     labelFields.from_city,
        from_state:    labelFields.from_state,
        from_zip:      labelFields.from_zip,
        from_country:  labelFields.from_country || 'USA',
        to_name:       labelFields.to_name,
        to_company:    labelFields.to_company || '',
        to_phone:      labelFields.to_phone || '',
        to_address1:   labelFields.to_address1,
        to_address2:   labelFields.to_address2 || '',
        to_city:       labelFields.to_city,
        to_state:      labelFields.to_state,
        to_zip:        labelFields.to_zip,
        to_country:    labelFields.to_country || 'USA',
        length: parseFloat(labelFields.length) || 1,
        width:  parseFloat(labelFields.width)  || 1,
        height: parseFloat(labelFields.height) || 1,
      });
      trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
    }

    // Deduct balance
    await balance.addTransaction({
      type:        'deduction',
      amount:      effectiveRate,
      description: `Label generated — ${vendor.carrier} ${vendor.name} (${trackingId || 'N/A'})`,
      performedBy: req.user._id
    });

    // Save label record
    const label = await Label.create({
      user:              req.user._id,
      vendor:            vendor._id,
      carrier:           vendor.carrier,
      vendorName:        vendor.name,
      shippingService:   vendor.shippingService,
      shippershubLabelId: shippershubResult?._id || null,
      trackingId,
      price:      effectiveRate,
      pdfUrl:     shippershubResult?.awsPath || shippershubResult?.pdfUrl || null,
      awsKey:     shippershubResult?.awsKey  || null,
      awsPath:    shippershubResult?.awsPath || null,
      isBulk:     false,
      ...labelFields,
      weight: parseFloat(labelFields.weight)
    });

    // Notify via socket.io
    if (req.io) {
      req.io.to(req.user._id.toString()).emit('label-generated', {
        labelId: label._id, trackingId, carrier: vendor.carrier
      });
    }

    res.status(201).json({
      message: 'Label generated successfully',
      label: {
        id:         label._id,
        trackingId: label.trackingId,
        carrier:    label.carrier,
        vendor:     label.vendorName,
        price:      label.price,
        pdfUrl:     label.pdfUrl,
        createdAt:  label.createdAt
      },
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Generate single label error:', error);
    res.status(500).json({ message: error.message || 'Server error generating label' });
  }
});

// ── POST /api/labels/bulk ─────────────────────────────────────
// Bulk label generation — accepts array of addresses
router.post('/bulk', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('labels').isArray({ min: 1 }).withMessage('At least one label is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, labels: labelRows } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    // Access check — admin bypasses, regular users must have an allowed record
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const outOfRange = labelRows
        .map((r, i) => ({ row: i + 1, weight: parseFloat(r.weight) || 0 }))
        .filter(({ weight }) => access.getRateForWeight(weight) === null);
      if (outOfRange.length > 0) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `${outOfRange.length} row(s) have weight outside your allowed range (${ranges}).`,
          invalidRows: outOfRange,
        });
      }
    }

    // Effective rate helper
    const getRate = (weight) => {
      if (isAdmin) return vendor.rate;
      const tierRate = access.getRateForWeight(weight);
      return (tierRate !== null && tierRate !== undefined) ? tierRate : vendor.rate;
    };

    // Pre-calculate costs
    const rowCosts  = labelRows.map(r => getRate(parseFloat(r.weight) || 0));
    const totalCost = rowCosts.reduce((s, c) => s + c, 0);

    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < totalCost) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${totalCost.toFixed(2)} for ${labelRows.length} labels, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // ── MANIFEST PATH ─────────────────────────────────────────
    if (vendor.vendorType === 'manifest') {
      // Deduct balance upfront
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `Manifest job — ${labelRows.length}x ${vendor.carrier} ${vendor.name}`,
        performedBy: req.user._id,
      });

      // Save CSV to disk
      const csvContent  = rowsToCSV(labelRows);
      const unique      = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const storedName  = `manifest-req-${unique}.csv`;
      const storedPath  = path.join(manifestRequestDir, storedName);
      fs.writeFileSync(storedPath, csvContent, 'utf8');

      // Create open ManifestJob (broadcast to all matching vendors)
      const job = await ManifestJob.create({
        user:    req.user._id,
        carrier: vendor.carrier,
        vendor:  vendor._id,
        status:  'open',
        requestFile: {
          originalName: `${vendor.carrier}_${vendor.name}_bulk.csv`,
          storedName,
          path:       storedPath,
          labelCount: labelRows.length,
        },
        userBilling: {
          labelCount:  labelRows.length,
          totalAmount: totalCost,
          deducted:    true,
          deductedAt:  new Date(),
        },
        timeline: [{ status: 'open', note: 'Job submitted by user — open for vendor acceptance' }],
      });

      // Broadcast to vendor portal via socket
      if (req.io) req.io.emit('manifest-job-open', { jobId: job._id, carrier: vendor.carrier });

      return res.status(201).json({
        type:        'manifest',
        manifestJobId: job._id,
        status:      'open',
        labelCount:  labelRows.length,
        carrier:     vendor.carrier,
        vendorName:  vendor.name,
        totalCost,
        newBalance:  balance.currentBalance,
        message:     'Manifest job submitted — waiting for a vendor to accept',
      });
    }

    // ── API PATH ──────────────────────────────────────────────
    const mongoose = require('mongoose');
    const bulkJobId   = new mongoose.Types.ObjectId().toString();
    const results     = [];
    const savedLabels = [];

    for (let i = 0; i < labelRows.length; i++) {
      const row = labelRows[i];
      try {
        let shippershubResult = null;
        let trackingId = '';

        if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
          shippershubResult = await shippershub.createSingleLabel({
            carrier:  vendor.shippershubCarrierId,
            vendor:   vendor.shippershubVendorId,
            ...row,
            weight: parseFloat(row.weight)
          });
          trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
        }

        const label = await Label.create({
          user:              req.user._id,
          vendor:            vendor._id,
          carrier:           vendor.carrier,
          vendorName:        vendor.name,
          shippingService:   vendor.shippingService,
          shippershubLabelId: shippershubResult?._id || null,
          trackingId,
          price:   rowCosts[i],
          pdfUrl:  shippershubResult?.awsPath || null,
          awsKey:  shippershubResult?.awsKey  || null,
          awsPath: shippershubResult?.awsPath || null,
          isBulk:      true,
          bulkJobId,
          ...row,
          weight: parseFloat(row.weight)
        });

        savedLabels.push(label);
        results.push({
          success: true, trackingId, labelId: label._id, cost: rowCosts[i],
          pdfUrl: shippershubResult?.awsPath || null,
          localPdf: shippershubResult?.localPdf || null,
        });
      } catch (err) {
        results.push({ success: false, error: err.message, row });
      }
    }

    // Deduct for successfully generated labels
    const successfulResults = results.filter(r => r.success);
    const totalDeduct = successfulResults.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    const successCount = successfulResults.length;
    if (totalDeduct > 0) {
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalDeduct,
        description: `Bulk labels — ${successfulResults.length}x ${vendor.carrier} ${vendor.name} (job: ${bulkJobId.slice(-6)})`,
        performedBy: req.user._id
      });
    }

    // Build ZIP of all generated PDFs (STORE, no recompression — preserves original bytes)
    let zipUrl = null;
    const localPdfs = successfulResults.map(r => r.localPdf).filter(Boolean);
    if (localPdfs.length > 0) {
      try {
        const zipFilename = `bulk-${bulkJobId.slice(-8)}-${Date.now()}.zip`;
        await createZip(localPdfs, zipFilename);
        zipUrl = `/labels/zip/${zipFilename}`;
        // Stamp the pre-built zip URL on every label in this batch so history can serve it directly
        await Label.updateMany({ bulkJobId }, { bulkZipUrl: zipUrl });
      } catch (zipErr) {
        console.error('ZIP creation error:', zipErr);
      }
    }

    res.status(201).json({
      type:       'api',
      message:    `${successCount}/${labelRows.length} labels generated`,
      bulkJobId,
      results,
      zipUrl,
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Bulk label error:', error);
    res.status(500).json({ message: error.message || 'Server error generating bulk labels' });
  }
});

// ── GET /api/labels ───────────────────────────────────────────
// Paginated label history for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 15, carrier, status, vendor, dateFrom, dateTo } = req.query;

    // This endpoint serves the single-label history only
    let filter = { isBulk: false };
    if (req.user.role !== 'admin') {
      filter.user = req.user._id;
    }
    if (carrier)  filter.carrier = carrier;
    if (status)   filter.status  = status;
    if (vendor)   filter.vendor  = vendor;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const total  = await Label.countDocuments(filter);
    const labels = await Label.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('vendor', 'name carrier rate')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      labels,
      total,
      totalPages:  Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Get labels error:', error);
    res.status(500).json({ message: 'Server error getting labels' });
  }
});

// ── GET /api/labels/bulk-jobs ─────────────────────────────────
// Returns bulk jobs grouped by bulkJobId with aggregated totals
router.get('/bulk-jobs', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 15, dateFrom, dateTo, vendor, vendorId, carrier, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const mongoose = require('mongoose');

    const matchStage = { isBulk: true };
    if (req.user.role !== 'admin') matchStage.user = new mongoose.Types.ObjectId(req.user._id);
    const vid = vendorId || vendor;
    if (vid) matchStage.vendor = new mongoose.Types.ObjectId(vid);
    if (carrier) matchStage.carrier = carrier;
    if (search)  matchStage.bulkFileName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const groupStage = {
      _id:           '$bulkJobId',
      userId:        { $first: '$user' },
      vendorId:      { $first: '$vendor' },
      vendorName:    { $first: '$vendorName' },
      carrier:       { $first: '$carrier' },
      bulkFileName:  { $first: '$bulkFileName' },
      bulkZipUrl:    { $first: '$bulkZipUrl' },
      totalLabels:   { $sum: 1 },
      totalPrice:    { $sum: '$price' },
      generatedCount:{ $sum: { $cond: [{ $eq: ['$status', 'generated'] }, 1, 0] } },
      failedCount:   { $sum: { $cond: [{ $eq: ['$status', 'failed']    }, 1, 0] } },
      trackingIds:   { $push: '$trackingId' },
      createdAt:     { $min: '$createdAt' },
    };

    const [jobs, countResult] = await Promise.all([
      Label.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      ]),
      Label.aggregate([
        { $match: matchStage },
        { $group: { _id: '$bulkJobId' } },
        { $count: 'total' },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;

    res.json({
      jobs,
      total,
      totalPages:  Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error('Get bulk jobs error:', error);
    res.status(500).json({ message: 'Server error getting bulk jobs' });
  }
});

// ── GET /api/labels/pdf/:filename ─────────────────────────────
// Serve a locally saved label PDF (authenticated)
router.get('/pdf/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(labelsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'PDF not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/zip/:filename ─────────────────────────────
// Download a pre-built bulk labels ZIP
router.get('/zip/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(zipsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'ZIP not found' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/zip/bulk/:bulkJobId ───────────────────────
// Serve the pre-built ZIP if it exists, otherwise build on-the-fly from local PDFs.
// Uses STORE (level 0) — no recompression, PDF bytes remain identical to originals.
router.get('/zip/bulk/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const { bulkJobId } = req.params;
    const filter = { bulkJobId, isBulk: true };
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const labels = await Label.find(filter);
    if (!labels.length) return res.status(404).json({ message: 'No labels found for this bulk job' });

    const zipName = `bulk-labels-${bulkJobId.slice(-8)}.zip`;

    // ── Prefer the pre-built ZIP stamped on the labels ────────
    const prebuiltUrl = labels[0]?.bulkZipUrl; // e.g. /api/labels/zip/bulk-xxxx.zip
    if (prebuiltUrl) {
      const prebuiltFilename = path.basename(prebuiltUrl);
      const prebuiltPath     = path.join(zipsDir, prebuiltFilename);
      if (fs.existsSync(prebuiltPath)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
        return fs.createReadStream(prebuiltPath).pipe(res);
      }
    }

    // ── Fallback: build on-the-fly from local PDFs ────────────
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 0 } }); // STORE — no recompression
    archive.on('error', err => { console.error('ZIP stream error:', err); res.end(); });
    archive.pipe(res);

    labels.forEach((label, i) => {
      if (label.pdfUrl) {
        const filename  = path.basename(label.pdfUrl);
        const localPath = path.join(labelsDir, filename);
        if (fs.existsSync(localPath)) {
          const entry = `label-${i + 1}${label.trackingId ? '-' + label.trackingId : ''}.pdf`;
          archive.file(localPath, { name: entry });
        }
      }
    });

    await archive.finalize();
  } catch (error) {
    console.error('Bulk ZIP error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to build ZIP' });
  }
});

// ── GET /api/labels/:id ───────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('vendor');

    if (!label) return res.status(404).json({ message: 'Label not found' });

    const isOwner = label.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ label });
  } catch (error) {
    console.error('Get label error:', error);
    res.status(500).json({ message: 'Server error getting label' });
  }
});

module.exports = router;
