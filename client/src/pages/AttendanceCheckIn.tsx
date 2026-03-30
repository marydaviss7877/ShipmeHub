import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  _id: string;
  status: 'present' | 'late' | 'half_day' | 'absent' | 'on_leave';
  checkInTime: string;
  markedByRole: 'self' | 'admin';
  deductionPKR: number;
  adminNote?: string;
}

interface SalarySummary {
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
  paidLeavesUsed: number;
  month: number;
  year: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABEL: Record<string, string> = {
  present:  'Present',
  late:     'Late',
  half_day: 'Half Day',
  absent:   'Absent',
  on_leave: 'On Leave',
};

const STATUS_COLOR: Record<string, string> = {
  present:  'bg-green-100 text-green-800 border-green-300',
  late:     'bg-yellow-100 text-yellow-800 border-yellow-300',
  half_day: 'bg-orange-100 text-orange-800 border-orange-300',
  absent:   'bg-red-100 text-red-800 border-red-300',
  on_leave: 'bg-blue-100 text-blue-800 border-blue-300',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function AttendanceCheckIn() {
  const { user } = useAuth();

  const [now, setNow]             = useState(new Date());
  const [record, setRecord]       = useState<AttendanceRecord | null>(null);
  const [inOffice, setInOffice]   = useState<boolean | null>(null);
  const [clientIP, setClientIP]   = useState('');
  const [salary, setSalary]       = useState<SalarySummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [checking, setChecking]   = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const now_ = new Date();
  const month = now_.getMonth() + 1;
  const year  = now_.getFullYear();

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [todayRes, salaryRes] = await Promise.all([
        axios.get('/attendance/my-today'),
        axios.get(`/attendance/my-salary?month=${month}&year=${year}`),
      ]);
      setRecord(todayRes.data.record);
      setInOffice(todayRes.data.inOffice);
      setClientIP(todayRes.data.clientIP || '');
      setSalary(salaryRes.data);
    } catch {
      setError('Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn() {
    setError('');
    setSuccess('');
    setChecking(true);
    try {
      const res = await axios.post('/attendance/check-in');
      setRecord(res.data.record);
      setSuccess(`Checked in successfully — marked as ${STATUS_LABEL[res.data.status]}`);
      // Reload salary
      const salaryRes = await axios.get(`/attendance/my-salary?month=${month}&year=${year}`);
      setSalary(salaryRes.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Check-in failed.');
    } finally {
      setChecking(false);
    }
  }

  if (!user) return <Navigate to="/login" replace />;

  // ── Derived display values ─────────────────────────────────────────────────
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Check-In</h1>
        <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
      </div>

      {/* ── Live Clock ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center">
        <div className="text-5xl font-mono font-bold text-gray-800 tracking-widest">
          {timeStr}
        </div>
        <p className="text-sm text-gray-400 mt-2">Office Local Time</p>
      </div>

      {/* ── Network Status ── */}
      {!loading && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          inOffice
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <span className="text-2xl">{inOffice ? '🟢' : '🔴'}</span>
          <div>
            <p className={`font-semibold ${inOffice ? 'text-green-800' : 'text-red-800'}`}>
              {inOffice ? 'Connected to Office Network' : 'Not on Office Network'}
            </p>
            <p className={`text-sm mt-0.5 ${inOffice ? 'text-green-600' : 'text-red-600'}`}>
              {inOffice
                ? 'You can check in from this device.'
                : 'Check-in is only available from the office WiFi. Connect to the office network and try again.'}
            </p>
            {clientIP && (
              <p className="text-xs text-gray-400 mt-1">Your IP: {clientIP}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Today's Status ── */}
      {!loading && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Today's Status</h2>

          {record ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold border ${STATUS_COLOR[record.status]}`}>
                  {STATUS_LABEL[record.status]}
                </span>
                {record.markedByRole === 'admin' && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Admin Override</span>
                )}
              </div>

              {record.checkInTime && (
                <p className="text-sm text-gray-600">
                  Check-in time: <span className="font-medium">
                    {new Date(record.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </p>
              )}

              {record.deductionPKR > 0 && (
                <p className="text-sm text-red-600">
                  Deduction today: <span className="font-semibold">−₨{record.deductionPKR.toLocaleString()}</span>
                </p>
              )}

              {record.adminNote && (
                <p className="text-sm text-gray-500 italic">Note: {record.adminNote}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-4">You haven't checked in yet today.</p>
              <button
                onClick={handleCheckIn}
                disabled={!inOffice || checking}
                className={`px-8 py-3 rounded-xl font-semibold text-white transition-all ${
                  inOffice && !checking
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-95'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {checking ? 'Checking in…' : '✓  Check In Now'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts ── */}
      {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{success}</p>}

      {/* ── Live Salary Widget ── */}
      {salary && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Salary — {MONTHS[salary.month - 1]} {salary.year}
          </h2>

          {/* Big numbers */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Base Salary</p>
              <p className="text-lg font-bold text-gray-700">₨{salary.baseSalary.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-xs text-red-400 mb-1">Deductions</p>
              <p className="text-lg font-bold text-red-600">−₨{salary.totalDeduction.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs text-green-500 mb-1">Net Salary</p>
              <p className="text-lg font-bold text-green-700">₨{salary.netSalary.toLocaleString()}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Earned</span>
              <span>{salary.baseSalary > 0 ? Math.round((salary.netSalary / salary.baseSalary) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${salary.baseSalary > 0 ? Math.min(100, (salary.netSalary / salary.baseSalary) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* Attendance breakdown */}
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            {[
              { label: 'Present', value: salary.presentDays, color: 'text-green-600' },
              { label: 'Late',    value: salary.lateDays,    color: 'text-yellow-600' },
              { label: 'Half Day',value: salary.halfDays,    color: 'text-orange-600' },
              { label: 'Absent',  value: salary.absentDays,  color: 'text-red-600' },
              { label: 'Leave',   value: salary.leaveDays,   color: 'text-blue-600' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-2">
                <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {salary.totalDeduction > 0 && (
            <p className="text-xs text-gray-400 text-center">
              Daily rate: ₨{salary.dailyRate.toLocaleString()} · Deduction this month: ₨{salary.totalDeduction.toLocaleString()}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      )}
    </div>
  );
}
