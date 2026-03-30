import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | 'on_leave';

interface AttendanceRecord {
  _id: string;
  status: AttendanceStatus;
  checkInTime?: string;
  markedByRole: 'self' | 'admin';
  deductionPKR: number;
  adminNote?: string;
}

interface AgentToday {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  record: AttendanceRecord | null;
}

interface AgentSalary {
  profileId: string;
  name: string;
  email: string;
  baseSalary: number;
  totalDeduction: number;
  netSalary: number;
  dailyRate: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  recordedDays: number;
}

interface MonthlyRecord {
  _id: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  markedByRole: 'self' | 'admin';
  deductionPKR: number;
  adminNote?: string;
}

interface MonthlyData {
  baseSalary: number;
  totalDeduction: number;
  netSalary: number;
  dailyRate: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  recordedDays: number;
  records: MonthlyRecord[];
  month: number;
  year: number;
}

interface AttendanceConfig {
  _id?: string;
  workingDaysPerMonth: number;
  shiftStartTime: string;
  lateGraceMinutes: number;
  halfDayThresholdTime: string;
  baseSalaryPKR: number;
  absentPenaltyMode: 'auto' | 'fixed';
  absentPenaltyPKR: number;
  halfDayPenaltyMode: 'auto' | 'fixed';
  halfDayPenaltyPKR: number;
  latePenaltyPKR: number;
  paidLeavesPerMonth: number;
  allowedIPs: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'present',  label: 'Present',  color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'late',     label: 'Late',     color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'half_day', label: 'Half Day', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'absent',   label: 'Absent',   color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'on_leave', label: 'On Leave', color: 'bg-blue-100 text-blue-800 border-blue-300' },
];

const defaultConfig: AttendanceConfig = {
  workingDaysPerMonth: 26,
  shiftStartTime: '09:00',
  lateGraceMinutes: 15,
  halfDayThresholdTime: '13:00',
  baseSalaryPKR: 30000,
  absentPenaltyMode: 'auto',
  absentPenaltyPKR: 0,
  halfDayPenaltyMode: 'auto',
  halfDayPenaltyPKR: 0,
  latePenaltyPKR: 200,
  paidLeavesPerMonth: 1,
  allowedIPs: [],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: AttendanceStatus | undefined) {
  if (!status) return <span className="text-gray-300 text-xs">—</span>;
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${opt?.color}`}>
      {opt?.label}
    </span>
  );
}

function buildDaysInMonth(month: number, year: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AttendanceAdmin() {
  const { user } = useAuth();

  const now_ = new Date();
  const [month, setMonth]   = useState(now_.getMonth() + 1);
  const [year,  setYear]    = useState(now_.getFullYear());
  const [tab,   setTab]     = useState<'today' | 'salary' | 'calendar' | 'config'>('today');

  // Config
  const [, setConfig]         = useState<AttendanceConfig>(defaultConfig);
  const [configDraft, setConfigDraft] = useState<AttendanceConfig>(defaultConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [newIP, setNewIP]           = useState('');
  const [detectingIP, setDetectingIP] = useState(false);

  // Today
  const [todayData, setTodayData]   = useState<AgentToday[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [markingId, setMarkingId]   = useState('');
  const [, setMarkNote]     = useState('');

  // Salary
  const [salaryData, setSalaryData] = useState<AgentSalary[]>([]);
  const [salaryLoading, setSalaryLoading] = useState(false);

  // Calendar
  const [calAgentId, setCalAgentId]       = useState('');
  const [calData, setCalData]             = useState<MonthlyData | null>(null);
  const [calLoading, setCalLoading]       = useState(false);
  const [calAgents, setCalAgents]         = useState<AgentToday[]>([]);

  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const res = await axios.get('/attendance/config');
      setConfig(res.data);
      setConfigDraft(res.data);
    } catch { /* silently ignore */ }
  }, []);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const res = await axios.get('/attendance/today-all');
      setTodayData(res.data);
      setCalAgents(res.data);
      if (!calAgentId && res.data.length > 0) setCalAgentId(res.data[0].profileId);
    } catch { setError('Failed to load today\'s attendance.'); }
    finally { setTodayLoading(false); }
  }, [calAgentId]);

  const loadSalary = useCallback(async () => {
    setSalaryLoading(true);
    try {
      const res = await axios.get(`/attendance/salary-all?month=${month}&year=${year}`);
      setSalaryData(res.data.agents);
    } catch { setError('Failed to load salary data.'); }
    finally { setSalaryLoading(false); }
  }, [month, year]);

  const loadCalendar = useCallback(async () => {
    if (!calAgentId) return;
    setCalLoading(true);
    try {
      const res = await axios.get(`/attendance/monthly/${calAgentId}?month=${month}&year=${year}`);
      setCalData(res.data);
    } catch { setError('Failed to load calendar data.'); }
    finally { setCalLoading(false); }
  }, [calAgentId, month, year]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => {
    if (tab === 'today')    loadToday();
    if (tab === 'salary')   loadSalary();
    if (tab === 'calendar') loadCalendar();
  }, [tab, loadToday, loadSalary, loadCalendar]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function saveConfig() {
    setConfigSaving(true);
    setError('');
    try {
      const res = await axios.put('/attendance/config', configDraft);
      setConfig(res.data);
      setConfigDraft(res.data);
      setSuccess('Config saved.');
    } catch { setError('Failed to save config.'); }
    finally { setConfigSaving(false); }
  }

  async function markAgent(profileId: string, status: AttendanceStatus, note = '') {
    setMarkingId(profileId);
    setError('');
    try {
      await axios.post('/attendance/admin-mark', {
        profileId,
        date: new Date().toISOString(),
        status,
        adminNote: note,
      });
      setSuccess(`Marked as ${status}.`);
      await loadToday();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to mark.');
    } finally { setMarkingId(''); setMarkNote(''); }
  }

  async function deleteRecord(recordId: string) {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await axios.delete(`/attendance/${recordId}`);
      setSuccess('Record deleted.');
      loadToday();
      if (tab === 'calendar') loadCalendar();
    } catch { setError('Failed to delete.'); }
  }

  async function markAbsentRemaining() {
    if (!window.confirm('Mark all agents without a check-in today as Absent?')) return;
    try {
      const res = await axios.post('/attendance/mark-absent-remaining');
      setSuccess(res.data.message);
      loadToday();
    } catch { setError('Failed.'); }
  }

  async function exportCSV() {
    window.open(`/api/attendance/export?month=${month}&year=${year}`, '_blank');
  }

  function addIP() {
    const ip = newIP.trim();
    if (!ip) return;
    if (!configDraft.allowedIPs.includes(ip)) {
      setConfigDraft(d => ({ ...d, allowedIPs: [...d.allowedIPs, ip] }));
    }
    setNewIP('');
  }

  function removeIP(ip: string) {
    setConfigDraft(d => ({ ...d, allowedIPs: d.allowedIPs.filter(x => x !== ip) }));
  }

  async function detectMyIP() {
    setDetectingIP(true);
    try {
      const res = await axios.get('/attendance/office-check');
      const ip = res.data.clientIP;
      if (ip && !configDraft.allowedIPs.includes(ip)) {
        setConfigDraft(d => ({ ...d, allowedIPs: [...d.allowedIPs, ip] }));
        setSuccess(`Added your current IP: ${ip}`);
      } else if (ip) {
        setSuccess(`Your IP (${ip}) is already in the list.`);
      }
    } catch {
      setError('Failed to detect IP.');
    } finally {
      setDetectingIP(false);
    }
  }

  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── Render ───────────────────────────────────────────────────────────────────

  const calDays     = buildDaysInMonth(month, year);
  const calRecordMap: Record<string, MonthlyRecord> = {};
  if (calData) {
    for (const r of calData.records) {
      const key = new Date(r.date).toDateString();
      calRecordMap[key] = r;
    }
  }

  const absentPenaltyAuto  = Math.round(configDraft.baseSalaryPKR / (configDraft.workingDaysPerMonth || 1));
  const halfDayPenaltyAuto = Math.round(absentPenaltyAuto / 2);

  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
          <p className="text-sm text-gray-500 mt-1">Track daily attendance and live salary deductions for sales agents.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{success}</p>}

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 flex gap-1">
        {(['today', 'salary', 'calendar', 'config'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(''); setSuccess(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'today' ? "Today's Attendance" : t === 'salary' ? 'Salary Summary' : t === 'calendar' ? 'Calendar View' : 'Settings'}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TODAY TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'today' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h2>
            <button
              onClick={markAbsentRemaining}
              className="text-sm px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Mark Remaining as Absent
            </button>
          </div>

          {todayLoading ? (
            <div className="text-center py-12 text-gray-400">Loading…</div>
          ) : todayData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No active sales agents found.</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Agent</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Check-In</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Deduction</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Mark As</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {todayData.map(agent => (
                    <tr key={agent.profileId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{agent.name || '—'}</p>
                        <p className="text-xs text-gray-400">{agent.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {agent.record?.checkInTime
                          ? new Date(agent.record.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(agent.record?.status)}
                        {agent.record?.markedByRole === 'admin' && (
                          <span className="ml-1 text-xs text-purple-500">(admin)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {agent.record?.deductionPKR
                          ? <span className="text-red-600 font-medium">−₨{agent.record.deductionPKR.toLocaleString()}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              disabled={markingId === agent.profileId}
                              onClick={() => markAgent(agent.profileId, opt.value)}
                              className={`px-2 py-0.5 rounded-full text-xs border font-medium transition-opacity hover:opacity-80 ${opt.color} ${
                                agent.record?.status === opt.value ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {agent.record && (
                          <button
                            onClick={() => deleteRecord(agent.record!._id)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SALARY TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'salary' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Salary Summary — {MONTHS[month - 1]} {year}
          </h2>

          {salaryLoading ? (
            <div className="text-center py-12 text-gray-400">Loading…</div>
          ) : salaryData.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No data.</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-xs text-gray-400">Total Agents</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{salaryData.length}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs text-red-400">Total Deductions</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    ₨{salaryData.reduce((s, a) => s + a.totalDeduction, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-xs text-green-500">Total Net Payable</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    ₨{salaryData.reduce((s, a) => s + a.netSalary, 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Per-agent table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Agent</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">P</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">L</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">HD</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">A</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-600">Leave</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Base</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Deduction</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Net Salary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salaryData.map(agent => (
                      <tr key={agent.profileId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{agent.name}</p>
                          <p className="text-xs text-gray-400">{agent.email}</p>
                        </td>
                        <td className="text-center px-3 py-3 text-green-600 font-medium">{agent.presentDays}</td>
                        <td className="text-center px-3 py-3 text-yellow-600 font-medium">{agent.lateDays}</td>
                        <td className="text-center px-3 py-3 text-orange-600 font-medium">{agent.halfDays}</td>
                        <td className="text-center px-3 py-3 text-red-600 font-medium">{agent.absentDays}</td>
                        <td className="text-center px-3 py-3 text-blue-600 font-medium">{agent.leaveDays}</td>
                        <td className="text-right px-4 py-3 text-gray-600">₨{agent.baseSalary.toLocaleString()}</td>
                        <td className="text-right px-4 py-3 text-red-600 font-medium">
                          {agent.totalDeduction > 0 ? `−₨${agent.totalDeduction.toLocaleString()}` : '—'}
                        </td>
                        <td className="text-right px-4 py-3">
                          <span className={`font-bold ${agent.totalDeduction > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            ₨{agent.netSalary.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t">
                  P = Present · L = Late · HD = Half Day · A = Absent
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Agent:</label>
            <select
              value={calAgentId}
              onChange={e => setCalAgentId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 max-w-xs"
            >
              {calAgents.map(a => (
                <option key={a.profileId} value={a.profileId}>{a.name || a.email}</option>
              ))}
            </select>
            <button
              onClick={loadCalendar}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Load
            </button>
          </div>

          {calLoading ? (
            <div className="text-center py-12 text-gray-400">Loading…</div>
          ) : calData ? (
            <div className="space-y-4">

              {/* Month summary */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Base Salary',   value: `₨${calData.baseSalary.toLocaleString()}`,    color: 'text-gray-700' },
                  { label: 'Deduction',     value: `−₨${calData.totalDeduction.toLocaleString()}`, color: 'text-red-600' },
                  { label: 'Net Salary',    value: `₨${calData.netSalary.toLocaleString()}`,      color: 'text-green-700' },
                  { label: 'Days Recorded', value: calData.recordedDays.toString(),               color: 'text-indigo-600' },
                ].map(c => (
                  <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {/* Empty cells before first day */}
                  {Array.from({ length: new Date(year, month - 1, 1).getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-16 border-r border-b border-gray-100 bg-gray-50" />
                  ))}
                  {calDays.map(day => {
                    const rec  = calRecordMap[day.toDateString()];
                    const isToday = day.toDateString() === new Date().toDateString();
                    const opt  = rec ? STATUS_OPTIONS.find(o => o.value === rec.status) : null;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`h-16 border-r border-b border-gray-100 p-1.5 flex flex-col justify-between relative ${
                          isToday ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <span className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                          {day.getDate()}
                        </span>
                        {rec && (
                          <div className="space-y-0.5">
                            <span className={`block text-center text-xs rounded px-1 border ${opt?.color}`}>
                              {opt?.label}
                            </span>
                            {rec.deductionPKR > 0 && (
                              <span className="block text-center text-xs text-red-500">
                                −₨{rec.deductionPKR}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed records list */}
              {calData.records.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">All Records</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">Check-In</th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">By</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">Deduction</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {calData.records.map(r => (
                        <tr key={r._id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-600">
                            {new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-2">{statusBadge(r.status)}</td>
                          <td className="px-4 py-2 text-gray-500">
                            {r.checkInTime
                              ? new Date(r.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs ${r.markedByRole === 'admin' ? 'text-purple-500' : 'text-green-500'}`}>
                              {r.markedByRole}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {r.deductionPKR > 0
                              ? <span className="text-red-500 font-medium">−₨{r.deductionPKR.toLocaleString()}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => deleteRecord(r._id)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">Select an agent and click Load.</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CONFIG TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'config' && (
        <div className="max-w-2xl space-y-6">

          {/* Shift settings */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Shift & Working Days</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500 block mb-1">Working Days / Month</label>
                <input
                  type="number" min={1} max={31}
                  value={configDraft.workingDaysPerMonth}
                  onChange={e => setConfigDraft(d => ({ ...d, workingDaysPerMonth: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">Shift Start Time</label>
                <input
                  type="time"
                  value={configDraft.shiftStartTime}
                  onChange={e => setConfigDraft(d => ({ ...d, shiftStartTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">Late Grace Period (minutes)</label>
                <input
                  type="number" min={0}
                  value={configDraft.lateGraceMinutes}
                  onChange={e => setConfigDraft(d => ({ ...d, lateGraceMinutes: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  After {configDraft.shiftStartTime} + {configDraft.lateGraceMinutes}m = marked Late
                </p>
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">Half Day Threshold Time</label>
                <input
                  type="time"
                  value={configDraft.halfDayThresholdTime}
                  onChange={e => setConfigDraft(d => ({ ...d, halfDayThresholdTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Check-in after this = Half Day</p>
              </div>
            </div>
          </div>

          {/* Salary & penalty settings */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Salary & Deductions</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500 block mb-1">Base Salary (PKR)</label>
                <input
                  type="number" min={0}
                  value={configDraft.baseSalaryPKR}
                  onChange={e => setConfigDraft(d => ({ ...d, baseSalaryPKR: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">Paid Leaves / Month</label>
                <input
                  type="number" min={0}
                  value={configDraft.paidLeavesPerMonth}
                  onChange={e => setConfigDraft(d => ({ ...d, paidLeavesPerMonth: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Absent penalty */}
            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Absent Day Penalty</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="absentMode" value="auto"
                    checked={configDraft.absentPenaltyMode === 'auto'}
                    onChange={() => setConfigDraft(d => ({ ...d, absentPenaltyMode: 'auto' }))}
                  />
                  Auto (₨{absentPenaltyAuto.toLocaleString()} / day)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="absentMode" value="fixed"
                    checked={configDraft.absentPenaltyMode === 'fixed'}
                    onChange={() => setConfigDraft(d => ({ ...d, absentPenaltyMode: 'fixed' }))}
                  />
                  Fixed Amount
                </label>
              </div>
              {configDraft.absentPenaltyMode === 'fixed' && (
                <input
                  type="number" min={0} placeholder="PKR per absent day"
                  value={configDraft.absentPenaltyPKR}
                  onChange={e => setConfigDraft(d => ({ ...d, absentPenaltyPKR: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              )}
            </div>

            {/* Half-day penalty */}
            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Half Day Penalty</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="halfMode" value="auto"
                    checked={configDraft.halfDayPenaltyMode === 'auto'}
                    onChange={() => setConfigDraft(d => ({ ...d, halfDayPenaltyMode: 'auto' }))}
                  />
                  Auto (₨{halfDayPenaltyAuto.toLocaleString()} — half of absent)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio" name="halfMode" value="fixed"
                    checked={configDraft.halfDayPenaltyMode === 'fixed'}
                    onChange={() => setConfigDraft(d => ({ ...d, halfDayPenaltyMode: 'fixed' }))}
                  />
                  Fixed Amount
                </label>
              </div>
              {configDraft.halfDayPenaltyMode === 'fixed' && (
                <input
                  type="number" min={0} placeholder="PKR per half day"
                  value={configDraft.halfDayPenaltyPKR}
                  onChange={e => setConfigDraft(d => ({ ...d, halfDayPenaltyPKR: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              )}
            </div>

            {/* Late penalty */}
            <div>
              <label className="text-sm text-gray-500 block mb-1">Late Penalty (PKR per occurrence)</label>
              <input
                type="number" min={0}
                value={configDraft.latePenaltyPKR}
                onChange={e => setConfigDraft(d => ({ ...d, latePenaltyPKR: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Office IP whitelist */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800">Office Network Whitelist</h3>
              <p className="text-xs text-gray-400 mt-1">
                Only these public IP addresses can submit check-ins. Leave empty to allow from anywhere (e.g. during setup).
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 203.128.10.55"
                value={newIP}
                onChange={e => setNewIP(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addIP()}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={addIP}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Add IP
              </button>
              <button
                onClick={detectMyIP}
                disabled={detectingIP}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                title="Auto-detect and add your current IP as seen by the server"
              >
                {detectingIP ? '…' : '+ Use My IP'}
              </button>
            </div>

            {configDraft.allowedIPs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {configDraft.allowedIPs.map(ip => (
                  <span key={ip} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs px-3 py-1.5 rounded-full">
                    {ip}
                    <button
                      onClick={() => removeIP(ip)}
                      className="text-gray-400 hover:text-red-500 font-bold leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No IPs configured — check-in is currently open from any network.
              </p>
            )}
          </div>

          <button
            onClick={saveConfig}
            disabled={configSaving}
            className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
          >
            {configSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
