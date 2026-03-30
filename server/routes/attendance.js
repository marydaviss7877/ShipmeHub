const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');

const { authenticateToken, authorize } = require('../middleware/auth');
const AttendanceConfig = require('../models/AttendanceConfig');
const AttendanceRecord = require('../models/AttendanceRecord');
const SalesAgentProfile = require('../models/SalesAgentProfile');
const User = require('../models/User');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract real client IP, normalizing IPv6-mapped IPv4 and loopback variants */
function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  const raw = fwd ? fwd.split(',')[0].trim() : (req.ip || req.connection?.remoteAddress || '');
  const ip = raw.replace(/^::ffff:/, '');
  // Normalize IPv6 loopback to IPv4 loopback so ::1 === 127.0.0.1
  return ip === '::1' ? '127.0.0.1' : ip;
}

/** Check if an IP matches a single entry (exact or CIDR) */
function ipMatchesEntry(ip, entry) {
  // Exact match
  if (ip === entry) return true;
  // CIDR match e.g. 192.168.1.0/24
  if (entry.includes('/')) {
    try {
      const [base, bits] = entry.split('/');
      const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
      const ipNum  = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
      const baseNum = base.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
      return (ipNum & mask) === (baseNum & mask);
    } catch { return false; }
  }
  return false;
}

/** Check whether the request IP is in the office whitelist */
async function isOfficeIP(req, cfg) {
  const config = cfg || await AttendanceConfig.getConfig();
  if (!config.allowedIPs || config.allowedIPs.length === 0) return true; // no restriction = all allowed
  const ip = getClientIP(req);
  return config.allowedIPs.some(entry => ipMatchesEntry(ip, entry));
}

/** Convert HH:MM string to today's Date object */
function timeStrToDate(timeStr, refDate) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(refDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Midnight UTC for a given date */
function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Determine attendance status from check-in time using config.
 * Returns: 'present' | 'late' | 'half_day'
 */
function resolveStatus(checkInTime, config) {
  const shiftStart  = timeStrToDate(config.shiftStartTime, checkInTime);
  const lateAt      = new Date(shiftStart.getTime() + config.lateGraceMinutes * 60000);
  const halfDayAt   = timeStrToDate(config.halfDayThresholdTime, checkInTime);

  if (checkInTime <= lateAt)   return 'present';
  if (checkInTime < halfDayAt) return 'late';
  return 'half_day';
}

/**
 * Calculate PKR deduction for a given status using config.
 */
function calcDeduction(status, config) {
  const dailyRate =
    config.absentPenaltyMode === 'fixed'
      ? config.absentPenaltyPKR
      : config.baseSalaryPKR / config.workingDaysPerMonth;

  const halfDayPenalty =
    config.halfDayPenaltyMode === 'fixed'
      ? config.halfDayPenaltyPKR
      : dailyRate / 2;

  switch (status) {
    case 'absent':    return Math.round(dailyRate);
    case 'half_day':  return Math.round(halfDayPenalty);
    case 'late':      return config.latePenaltyPKR;
    case 'on_leave':  return 0; // handled separately (paid leave logic)
    default:          return 0; // present
  }
}

/**
 * Build a full salary summary for an agent in a given month.
 */
async function buildSalarySummary(agentProfileId, month, year, config) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month,     1);

  const records = await AttendanceRecord.find({
    agent: agentProfileId,
    date:  { $gte: monthStart, $lt: monthEnd },
  }).sort({ date: 1 });

  const dailyRate =
    config.absentPenaltyMode === 'fixed'
      ? config.absentPenaltyPKR
      : config.baseSalaryPKR / config.workingDaysPerMonth;

  const halfDayPenalty =
    config.halfDayPenaltyMode === 'fixed'
      ? config.halfDayPenaltyPKR
      : dailyRate / 2;

  let totalDeduction = 0;
  let presentDays    = 0;
  let lateDays       = 0;
  let halfDays       = 0;
  let absentDays     = 0;
  let leaveDays      = 0;
  let paidLeavesUsed = 0;

  for (const rec of records) {
    switch (rec.status) {
      case 'present':
        presentDays++;
        break;
      case 'late':
        lateDays++;
        presentDays++;
        totalDeduction += config.latePenaltyPKR;
        break;
      case 'half_day':
        halfDays++;
        totalDeduction += Math.round(halfDayPenalty);
        break;
      case 'absent':
        absentDays++;
        totalDeduction += Math.round(dailyRate);
        break;
      case 'on_leave':
        leaveDays++;
        if (paidLeavesUsed < config.paidLeavesPerMonth) {
          paidLeavesUsed++; // no deduction
        } else {
          totalDeduction += Math.round(dailyRate); // unpaid leave
        }
        break;
    }
  }

  const netSalary = Math.max(0, config.baseSalaryPKR - totalDeduction);

  return {
    baseSalary:    config.baseSalaryPKR,
    totalDeduction,
    netSalary,
    dailyRate:     Math.round(dailyRate * 100) / 100,
    halfDayPenalty: Math.round(halfDayPenalty * 100) / 100,
    presentDays,
    lateDays,
    halfDays,
    absentDays,
    leaveDays,
    paidLeavesUsed,
    recordedDays:  records.length,
    records,
  };
}

// ── Middleware: all routes require auth ────────────────────────────────────────
router.use(authenticateToken);

// ── GET /api/attendance/config ─────────────────────────────────────────────────
router.get('/config', authorize('admin'), async (req, res) => {
  try {
    const config = await AttendanceConfig.getConfig();
    res.json(config);
  } catch (err) {
    console.error('GET /attendance/config error:', err);
    res.status(500).json({ message: 'Failed to fetch config' });
  }
});

// ── PUT /api/attendance/config ─────────────────────────────────────────────────
router.put('/config', authorize('admin'), async (req, res) => {
  try {
    const allowed = [
      'workingDaysPerMonth', 'shiftStartTime', 'lateGraceMinutes',
      'halfDayThresholdTime', 'baseSalaryPKR',
      'absentPenaltyMode', 'absentPenaltyPKR',
      'halfDayPenaltyMode', 'halfDayPenaltyPKR',
      'latePenaltyPKR', 'paidLeavesPerMonth', 'allowedIPs',
    ];

    const update = { updatedBy: req.user._id };
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const config = await AttendanceConfig.findOneAndUpdate(
      {},
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json(config);
  } catch (err) {
    console.error('PUT /attendance/config error:', err);
    res.status(500).json({ message: 'Failed to save config' });
  }
});

// ── GET /api/attendance/office-check ──────────────────────────────────────────
// Returns whether the caller is on the office network
router.get('/office-check', async (req, res) => {
  try {
    const config    = await AttendanceConfig.getConfig();
    const inOffice  = await isOfficeIP(req, config);
    const clientIP  = getClientIP(req);
    res.json({ inOffice, clientIP, allowedIPs: config.allowedIPs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to check network' });
  }
});

// ── POST /api/attendance/check-in ─────────────────────────────────────────────
// Employee self check-in — IP restricted to office network
router.post('/check-in', async (req, res) => {
  try {
    const config = await AttendanceConfig.getConfig();

    // IP gate
    if (!(await isOfficeIP(req, config))) {
      return res.status(403).json({
        message: 'Check-in is only available from the office network.',
        inOffice: false,
      });
    }

    // Caller must be a sales agent
    const profile = await SalesAgentProfile.findOne({ user: req.user._id, isActive: true });
    if (!profile) {
      return res.status(403).json({ message: 'Only active sales agents can check in.' });
    }

    const now   = new Date();
    const today = dayStart(now);

    // Prevent duplicate check-in
    const existing = await AttendanceRecord.findOne({ agent: profile._id, date: today });
    if (existing) {
      return res.status(409).json({
        message: 'Already checked in today.',
        record: existing,
      });
    }

    const status     = resolveStatus(now, config);
    const deduction  = calcDeduction(status, config);

    const record = await AttendanceRecord.create({
      agent:        profile._id,
      date:         today,
      status,
      checkInTime:  now,
      checkInIP:    getClientIP(req),
      markedBy:     req.user._id,
      markedByRole: 'self',
      deductionPKR: deduction,
    });

    // Emit real-time update to admin room
    if (req.io) {
      req.io.emit('attendance-checkin', {
        agentId:    profile._id,
        userId:     req.user._id,
        status,
        checkInTime: now,
      });
    }

    res.status(201).json({ record, status, deductionPKR: deduction });
  } catch (err) {
    console.error('POST /attendance/check-in error:', err);
    res.status(500).json({ message: 'Check-in failed' });
  }
});

// ── GET /api/attendance/my-today ──────────────────────────────────────────────
// Returns today's record for the calling user (sales agent)
router.get('/my-today', async (req, res) => {
  try {
    const profile = await SalesAgentProfile.findOne({ user: req.user._id });
    if (!profile) return res.json({ record: null, inOffice: false });

    const config  = await AttendanceConfig.getConfig();
    const today   = dayStart(new Date());
    const record  = await AttendanceRecord.findOne({ agent: profile._id, date: today });
    const inOffice = await isOfficeIP(req, config);

    res.json({ record, inOffice, clientIP: getClientIP(req) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch today status' });
  }
});

// ── GET /api/attendance/my-salary?month=&year= ────────────────────────────────
// Live salary calculation for the calling sales agent
router.get('/my-salary', async (req, res) => {
  try {
    const profile = await SalesAgentProfile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Not a sales agent' });

    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const config  = await AttendanceConfig.getConfig();
    const summary = await buildSalarySummary(profile._id, month, year, config);

    res.json({ ...summary, month, year });
  } catch (err) {
    res.status(500).json({ message: 'Failed to calculate salary' });
  }
});

// ── GET /api/attendance/today-all ─────────────────────────────────────────────
// Admin: today's attendance for ALL active sales agents
router.get('/today-all', authorize('admin'), async (req, res) => {
  try {
    const today    = dayStart(new Date());
    const profiles = await SalesAgentProfile.find({ isActive: true })
      .populate('user', 'firstName lastName email');

    const records  = await AttendanceRecord.find({ date: today });
    const recordMap = {};
    for (const r of records) recordMap[r.agent.toString()] = r;

    const result = profiles.map(p => ({
      profileId:   p._id,
      userId:      p.user?._id,
      name:        `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim(),
      email:       p.user?.email || '',
      record:      recordMap[p._id.toString()] || null,
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /attendance/today-all error:', err);
    res.status(500).json({ message: 'Failed to fetch today attendance' });
  }
});

// ── GET /api/attendance/monthly/:profileId?month=&year= ───────────────────────
// Monthly records for one agent (admin or self)
router.get('/monthly/:profileId', async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    // Access check: admin can see anyone, agent can only see themselves
    if (req.user.role !== 'admin') {
      const profile = await SalesAgentProfile.findOne({ user: req.user._id });
      if (!profile || profile._id.toString() !== req.params.profileId) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const config  = await AttendanceConfig.getConfig();
    const summary = await buildSalarySummary(req.params.profileId, month, year, config);

    res.json({ ...summary, month, year });
  } catch (err) {
    console.error('GET /attendance/monthly error:', err);
    res.status(500).json({ message: 'Failed to fetch monthly attendance' });
  }
});

// ── GET /api/attendance/salary-all?month=&year= ───────────────────────────────
// Admin: salary summary for ALL active agents
router.get('/salary-all', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const config   = await AttendanceConfig.getConfig();
    const profiles = await SalesAgentProfile.find({ isActive: true })
      .populate('user', 'firstName lastName email');

    const results = await Promise.all(profiles.map(async (p) => {
      const summary = await buildSalarySummary(p._id, month, year, config);
      return {
        profileId: p._id,
        name:      `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim(),
        email:     p.user?.email || '',
        ...summary,
        records: undefined, // strip individual records from list view
      };
    }));

    res.json({ agents: results, config, month, year });
  } catch (err) {
    console.error('GET /attendance/salary-all error:', err);
    res.status(500).json({ message: 'Failed to fetch salary summary' });
  }
});

// ── POST /api/attendance/admin-mark ───────────────────────────────────────────
// Admin: manually mark or override attendance for an agent on a date
router.post('/admin-mark', authorize('admin'), async (req, res) => {
  try {
    const { profileId, date, status, adminNote } = req.body;

    if (!profileId || !date || !status) {
      return res.status(400).json({ message: 'profileId, date, and status are required' });
    }

    const validStatuses = ['present', 'late', 'half_day', 'absent', 'on_leave'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const profile = await SalesAgentProfile.findById(profileId);
    if (!profile) return res.status(404).json({ message: 'Sales agent profile not found' });

    const config     = await AttendanceConfig.getConfig();
    const deduction  = calcDeduction(status, config);
    const recordDate = dayStart(new Date(date));

    const record = await AttendanceRecord.findOneAndUpdate(
      { agent: profileId, date: recordDate },
      {
        status,
        markedBy:     req.user._id,
        markedByRole: 'admin',
        adminNote:    adminNote || '',
        deductionPKR: deduction,
        // Only set checkInTime if it's a check-in-style mark
        ...(status !== 'absent' && status !== 'on_leave'
          ? { checkInTime: new Date(date) }
          : { checkInTime: null }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ record });
  } catch (err) {
    console.error('POST /attendance/admin-mark error:', err);
    res.status(500).json({ message: 'Failed to mark attendance' });
  }
});

// ── POST /api/attendance/mark-absent-remaining ────────────────────────────────
// Admin: mark all agents who have NO record today as absent
router.post('/mark-absent-remaining', authorize('admin'), async (req, res) => {
  try {
    const today    = dayStart(new Date());
    const profiles = await SalesAgentProfile.find({ isActive: true });
    const existing = await AttendanceRecord.find({ date: today }).select('agent');
    const checkedInIds = new Set(existing.map(r => r.agent.toString()));

    const config   = await AttendanceConfig.getConfig();
    const deduction = calcDeduction('absent', config);

    const toMark = profiles.filter(p => !checkedInIds.has(p._id.toString()));

    const ops = toMark.map(p => ({
      updateOne: {
        filter: { agent: p._id, date: today },
        update: {
          $setOnInsert: {
            agent:        p._id,
            date:         today,
            status:       'absent',
            markedBy:     req.user._id,
            markedByRole: 'admin',
            deductionPKR: deduction,
            adminNote:    'Auto-marked absent (no check-in)',
          },
        },
        upsert: true,
      },
    }));

    if (ops.length === 0) {
      return res.json({ message: 'All agents already have a record for today.', marked: 0 });
    }

    await AttendanceRecord.bulkWrite(ops);
    res.json({ message: `Marked ${ops.length} agent(s) as absent.`, marked: ops.length });
  } catch (err) {
    console.error('POST /attendance/mark-absent-remaining error:', err);
    res.status(500).json({ message: 'Failed to mark remaining agents' });
  }
});

// ── DELETE /api/attendance/:id ────────────────────────────────────────────────
// Admin: delete a record (to re-mark from scratch)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const record = await AttendanceRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete record' });
  }
});

// ── GET /api/attendance/export?month=&year= ───────────────────────────────────
// Admin: CSV export of full monthly attendance for all agents
router.get('/export', authorize('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);
    const year  = parseInt(req.query.year)  || now.getFullYear();

    const config   = await AttendanceConfig.getConfig();
    const profiles = await SalesAgentProfile.find({ isActive: true })
      .populate('user', 'firstName lastName email');

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Name', 'Email',
      'Present Days', 'Late Days', 'Half Days', 'Absent Days', 'Leave Days',
      'Recorded Days', 'Base Salary (PKR)', 'Total Deduction (PKR)', 'Net Salary (PKR)',
    ];

    const rows = await Promise.all(profiles.map(async (p) => {
      const s = await buildSalarySummary(p._id, month, year, config);
      return [
        `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim(),
        p.user?.email || '',
        s.presentDays, s.lateDays, s.halfDays, s.absentDays, s.leaveDays,
        s.recordedDays, s.baseSalary, s.totalDeduction, s.netSalary,
      ].map(escape).join(',');
    }));

    const csv = [headers.map(escape).join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition',
      `attachment; filename="attendance_${MONTHS[month - 1]}_${year}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /attendance/export error:', err);
    res.status(500).json({ message: 'Failed to export' });
  }
});

module.exports = router;
