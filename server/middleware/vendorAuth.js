const jwt           = require('jsonwebtoken');
const ManifestVendor = require('../models/ManifestVendor');

const authenticateVendor = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Vendor access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'vendor') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    const vendor = await ManifestVendor.findById(decoded.vendorId);
    if (!vendor) {
      return res.status(401).json({ message: 'Vendor not found' });
    }
    if (!vendor.isActive) {
      return res.status(401).json({ message: 'Vendor portal access is disabled' });
    }

    req.vendor = vendor;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const generateVendorToken = (vendorId) => {
  return jwt.sign(
    { vendorId, type: 'vendor' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
};

module.exports = { authenticateVendor, generateVendorToken };
