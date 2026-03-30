const startTime = Date.now();
console.log('⏳ Starting ShipmeHub server…');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const emailRoutes   = require('./routes/email');
const balanceRoutes = require('./routes/balance');
const rateRoutes    = require('./routes/rates');
const carrierRoutes        = require('./routes/carriers');
const labelRoutes          = require('./routes/labels');
const vendorRoutes         = require('./routes/vendors');
const accessRoutes         = require('./routes/access');
const manifestRoutes       = require('./routes/manifest');
const adminManifestRoutes  = require('./routes/adminManifest');
const vendorPortalRoutes     = require('./routes/vendorPortal');
const manifestVendorRoutes   = require('./routes/manifestVendors');
const announcementRoutes     = require('./routes/announcements');
const paymentLogRoutes       = require('./routes/paymentLogs');
const statsRoutes            = require('./routes/stats');
const salesAgentRoutes       = require('./routes/salesAgents');
const financeRoutes            = require('./routes/finance');
const walletRoutes             = require('./routes/wallets');
const expenseCategoryRoutes    = require('./routes/expenseCategories');
const cashbookRoutes           = require('./routes/cashbook');
const equityPartnerRoutes      = require('./routes/equityPartners');
const financialDashboardRoutes = require('./routes/financialDashboard');
const attendanceRoutes              = require('./routes/attendance');
const shippershubAccountRoutes      = require('./routes/shippershubAccounts');

const app = express();
const server = createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL]
  : ['http://localhost:3000', 'http://localhost:3001'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Rate limiting — generous limit for development, tighten for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { message: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Stricter limiter just for auth endpoints in production
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { message: 'Too many login attempts, please try again later.' }
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/email',    emailRoutes);
app.use('/api/balance',  balanceRoutes);
app.use('/api/rates',    rateRoutes);
app.use('/api/carriers',       carrierRoutes);
app.use('/api/labels',         labelRoutes);
app.use('/api/vendors',        vendorRoutes);
app.use('/api/access',         accessRoutes);
app.use('/api/manifest',       manifestRoutes);
app.use('/api/admin/manifest', adminManifestRoutes);
app.use('/api/vendor-portal',    vendorPortalRoutes);
app.use('/api/manifest-vendors', manifestVendorRoutes);
app.use('/api/announcements',   announcementRoutes);
app.use('/api/payment-logs',    paymentLogRoutes);
app.use('/api/stats',           statsRoutes);
app.use('/api/sales-agents',    salesAgentRoutes);
app.use('/api/finance',               financeRoutes);
app.use('/api/wallets',               walletRoutes);
app.use('/api/expense-categories',    expenseCategoryRoutes);
app.use('/api/cashbook',              cashbookRoutes);
app.use('/api/equity-partners',       equityPartnerRoutes);
app.use('/api/financial-dashboard',   financialDashboardRoutes);
app.use('/api/attendance',            attendanceRoutes);
app.use('/api/shippershub-accounts',  shippershubAccountRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Serve React build in production; API info + 404 in development
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'USPS Label Portal API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        users: '/api/users',
        files: '/api/files',
        email: '/api/email',
        balance: '/api/balance',
        rates: '/api/rates',
        carriers: '/api/carriers',
        vendors: '/api/vendors',
        labels: '/api/labels',
        access: '/api/access'
      }
    });
  });
  app.use('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('join-room', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ── MongoDB Connection + Server Start ─────────────────────────
const PORT = process.env.PORT || 5001;

const connectDB = async () => {
  try {
    console.log('⏳ Connecting to MongoDB…');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

// Auto-seed ShippersHub account from .env if DB has none yet
async function seedShippersHubAccount() {
  try {
    const ShippersHubAccount = require('./models/ShippersHubAccount');
    const count = await ShippersHubAccount.countDocuments();
    if (count > 0) return; // already have accounts, skip

    const email    = process.env.SHIPPERSHUB_EMAIL;
    const password = process.env.SHIPPERSHUB_PASSWORD;
    if (!email || !password) return; // no env creds to migrate

    const account = new ShippersHubAccount({ name: 'Default Account', email, encryptedPassword: '', iv: '', isActive: true });
    account.setPassword(password);
    await account.save();
    console.log(`✅ ShippersHub default account seeded from .env (${email})`);
  } catch (err) {
    console.warn('⚠️  Could not seed ShippersHub account:', err.message);
  }
}

connectDB().then(async () => {
  await seedShippersHubAccount();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} (started in ${Date.now() - startTime}ms)`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Killing the old process and retrying…`);
      const { execSync } = require('child_process');
      try {
        if (process.platform === 'win32') {
          const result = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
          const lines = result.trim().split('\n');
          const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()).filter(p => p && p !== '0'))];
          pids.forEach(pid => { try { execSync(`taskkill /F /PID ${pid}`); } catch (_) {} });
        } else {
          execSync(`fuser -k ${PORT}/tcp`);
        }
      } catch (_) {}
      setTimeout(() => {
        server.close();
        server.listen(PORT, () => {
          console.log(`🚀 Server running on port ${PORT} (restarted)`);
        });
      }, 1000);
    } else {
      throw err;
    }
  });
});
