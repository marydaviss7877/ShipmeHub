import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  CurrencyDollarIcon, TagIcon, ClipboardDocumentListIcon, CheckCircleIcon,
  UserGroupIcon, ArrowUpRightIcon, TruckIcon, ClockIcon,
  ArrowPathIcon, UserPlusIcon, BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserStats {
  balance: { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:  { total: number; generated: number; failed: number; spent: number; byCarrier: Record<string, number> };
  manifests: { total: number; active: number; completed: number; cancelled: number };
  recentLabels:   any[];
  activeManifests: any[];
}

interface ResellerStats {
  clientCount:    number;
  activeClients:  number;
  myBalance:  { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:     { total: number; revenue: number; byCarrier: Record<string, number> };
  manifests:  { total: number; active: number; completed: number; revenue: number };
  totalClientSpend: number;
  recentClients:  any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (v: number) =>
  `$${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#92400E', FedEx: '#5B21B6', DHL: '#B45309',
};

const MANIFEST_STATUS_COLOR: Record<string, string> = {
  open: '#6366f1', assigned: '#0ea5e9', accepted: '#0ea5e9',
  uploaded: '#f59e0b', under_review: '#ef4444', completed: '#22c55e',
  cancelled: '#94a3b8', rejected: '#f97316',
};

const MANIFEST_STATUS_LABEL: Record<string, string> = {
  open: 'Open', assigned: 'Assigned', accepted: 'Accepted',
  uploaded: 'Uploaded', under_review: 'Under Review',
  completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected',
};

// ── Sub-components ────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, sub, color, Icon, onClick,
}: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      background: '#fff', border: '1.5px solid var(--navy-150, #e8edf5)',
      borderRadius: 14, padding: '1.1rem 1.3rem',
      display: 'flex', flexDirection: 'column', gap: 5,
      cursor: onClick ? 'pointer' : 'default',
      position: 'relative', overflow: 'hidden',
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
  >
    <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: color, borderRadius: '14px 0 0 14px' }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon style={{ width: 15, height: 15, color }} />
      </div>
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{sub}</div>}
  </div>
);

const QuickAction = ({ label, sub, Icon, color, onClick }: { label: string; sub: string; Icon: React.ElementType; color: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0.7rem 0.9rem', borderRadius: 10,
      border: '1.5px solid var(--navy-100)',
      background: '#fff', cursor: 'pointer', textAlign: 'left', width: '100%',
      transition: 'all 0.12s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}08`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--navy-100)'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
  >
    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon style={{ width: 16, height: 16, color }} />
    </div>
    <div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)' }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{sub}</div>
    </div>
  </button>
);

// ── User Dashboard ─────────────────────────────────────────────────────────────
const UserDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]     = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/stats');
      setStats(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats)  return null;

  const { balance, labels, manifests, recentLabels, activeManifests } = stats;
  const totalLabels = labels.total || 1;
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

      {/* Header */}
      <div>
        <h1 className="page-title">{greeting}, {firstName}!</h1>
        <p className="page-subtitle">Here's your shipping activity overview.</p>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.875rem' }}>
        <MetricCard label="Balance"         value={fmt$(balance.currentBalance)} sub={`${fmt$(balance.totalDeposited)} deposited`} color="#22c55e" Icon={CurrencyDollarIcon} onClick={() => navigate('/profile')} />
        <MetricCard label="Labels Generated" value={labels.generated}            sub={`${labels.failed} failed`}                   color="#0ea5e9" Icon={TagIcon}             onClick={() => navigate('/labels/history')} />
        <MetricCard label="Active Manifests" value={manifests.active}            sub={`${manifests.completed} completed`}          color="#f59e0b" Icon={ClipboardDocumentListIcon} />
        <MetricCard label="Total Spent"      value={fmt$(balance.totalSpent)}    sub="Labels + manifests"                          color="#6366f1" Icon={CurrencyDollarIcon} />
      </div>

      {/* Mid row — carrier breakdown + active jobs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Labels by Carrier */}
        <div className="sh-card" style={{ padding: '1.2rem 1.4rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '1rem' }}>Labels by Carrier</h3>
          {['USPS','UPS','FedEx','DHL'].map(c => {
            const count = labels.byCarrier[c] || 0;
            const pct   = Math.round((count / totalLabels) * 100);
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 48, fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                <div style={{ flex: 1, height: 7, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_COLORS[c], borderRadius: 99 }} />
                </div>
                <span style={{ width: 28, fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-700)', textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>Total Labels</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)' }}>{labels.total}</span>
          </div>
        </div>

        {/* Active Manifest Jobs */}
        <div className="sh-card" style={{ padding: '1.2rem 1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Active Manifest Jobs</h3>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/bulk')}>
              Submit Job →
            </button>
          </div>
          {activeManifests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--navy-400)', fontSize: '0.82rem' }}>
              No active jobs. <button onClick={() => navigate('/labels/bulk')} style={{ background: 'none', border: 'none', color: 'var(--accent-600)', cursor: 'pointer', fontWeight: 600 }}>Submit one →</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeManifests.map((job: any) => (
                <div key={job._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem', background: 'var(--navy-50, #f8fafc)', borderRadius: 9, cursor: 'pointer' }} onClick={() => navigate('/labels/bulk')}>
                  <span className={`carrier-badge ${job.carrier?.toLowerCase()}`} style={{ flexShrink: 0 }}>{job.carrier}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)' }}>{job.userBilling?.labelCount ?? '?'} labels</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{job.assignedVendor?.name ?? 'Unassigned'}</div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                    background: `${MANIFEST_STATUS_COLOR[job.status] || '#94a3b8'}18`,
                    color: MANIFEST_STATUS_COLOR[job.status] || '#64748b',
                  }}>{MANIFEST_STATUS_LABEL[job.status] || job.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Labels */}
      <div className="sh-card">
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Recent Labels</h3>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/history')}>
            View all →
          </button>
        </div>
        {recentLabels.length === 0 ? (
          <div className="empty-state">
            <TagIcon style={{ width: 36, height: 36 }} />
            <h3>No labels yet</h3>
            <p>Generate your first label to see it here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead><tr><th>Carrier</th><th>Tracking</th><th>Type</th><th>Cost</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {recentLabels.map((lbl: any) => (
                  <tr key={lbl._id}>
                    <td><span className={`carrier-badge ${lbl.carrier?.toLowerCase()}`}>{lbl.carrier || '—'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--navy-600)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lbl.trackingId || '—'}
                    </td>
                    <td><span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{lbl.isBulk ? 'Bulk' : 'Single'}</span></td>
                    <td style={{ fontWeight: 600, color: lbl.price > 0 ? '#ef4444' : 'var(--navy-400)' }}>{lbl.price > 0 ? fmt$(lbl.price) : '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>{new Date(lbl.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: lbl.status === 'generated' ? '#f0fdf4' : '#fef2f2',
                        color:      lbl.status === 'generated' ? '#16a34a'  : '#dc2626',
                      }}>{lbl.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '0.875rem' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          <QuickAction label="Single Label"    sub="Generate one label now"       Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"     sub="Upload CSV, generate many"    Icon={ClipboardDocumentListIcon} color="#6366f1" onClick={() => navigate('/labels/bulk')} />
          <QuickAction label="Label History"    sub="View all generated labels"   Icon={ClockIcon}                 color="#f59e0b" onClick={() => navigate('/labels/history')} />
          <QuickAction label="View Carriers"   sub="Browse available services"   Icon={TruckIcon}                 color="#22c55e" onClick={() => navigate('/carriers')} />
        </div>
      </div>
    </div>
  );
};

// ── Reseller Dashboard ────────────────────────────────────────────────────────
const ResellerDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]     = useState<ResellerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/stats');
      setStats(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!stats)  return null;

  const { myBalance, labels, manifests, recentClients, clientCount, activeClients, totalClientSpend } = stats;
  const totalLabels = labels.total || 1;
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

      {/* Header */}
      <div>
        <h1 className="page-title">{greeting}, {firstName}!</h1>
        <p className="page-subtitle">Your reseller account overview.</p>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.875rem' }}>
        <MetricCard label="My Balance"       value={fmt$(myBalance.currentBalance)} sub={`${fmt$(myBalance.totalDeposited)} deposited`} color="#22c55e" Icon={CurrencyDollarIcon} onClick={() => navigate('/profile')} />
        <MetricCard label="Total Clients"    value={clientCount}                    sub={`${activeClients} active`}                    color="#6366f1" Icon={UserGroupIcon}       onClick={() => navigate('/reseller/clients')} />
        <MetricCard label="Client Labels"    value={labels.total}                   sub="Generated by clients"                         color="#0ea5e9" Icon={TagIcon} />
        <MetricCard label="Client Spend"     value={fmt$(totalClientSpend)}         sub="Labels + manifest jobs"                       color="#f59e0b" Icon={CurrencyDollarIcon} />
      </div>

      {/* Mid row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* My Balance */}
        <div className="sh-card" style={{ padding: '1.2rem 1.4rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '1rem' }}>My Balance</h3>
          {[
            { label: 'Available Balance', val: fmt$(myBalance.currentBalance), color: '#22c55e' },
            { label: 'Total Deposited',   val: fmt$(myBalance.totalDeposited), color: '#6366f1' },
            { label: 'Total Spent',       val: fmt$(myBalance.totalSpent),     color: '#ef4444' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--navy-50, #f8fafc)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--navy-500)' }}>{label}</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Client Activity */}
        <div className="sh-card" style={{ padding: '1.2rem 1.4rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '1rem' }}>Client Activity</h3>
          {/* Labels by carrier */}
          {['USPS','UPS','FedEx','DHL'].map(c => {
            const count = labels.byCarrier?.[c] || 0;
            const pct   = Math.round((count / totalLabels) * 100);
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 48, fontSize: '0.73rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                <div style={{ flex: 1, height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_COLORS[c], borderRadius: 99 }} />
                </div>
                <span style={{ width: 24, fontSize: '0.73rem', fontWeight: 700, color: 'var(--navy-700)', textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Active Jobs',    val: manifests.active,    color: '#f59e0b' },
              { label: 'Completed Jobs', val: manifests.completed, color: '#22c55e' },
              { label: 'Total Manifests',val: manifests.total,     color: 'var(--navy-700)' },
              { label: 'Manifest Revenue', val: fmt$(manifests.revenue), color: '#6366f1' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Clients */}
      <div className="sh-card">
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserGroupIcon style={{ width: 15, height: 15, color: '#6366f1' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>My Clients</h3>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/reseller/clients')}>
            Manage clients →
          </button>
        </div>
        {recentClients.length === 0 ? (
          <div className="empty-state">
            <UserGroupIcon style={{ width: 36, height: 36 }} />
            <h3>No clients yet</h3>
            <p>Add your first client from the Clients page.</p>
          </div>
        ) : (
          <div>
            {recentClients.map((c: any) => (
              <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--navy-50, #f8fafc)' }}>
                <div className="avatar avatar-sm avatar-indigo" style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                  {c.firstName?.charAt(0)}{c.lastName?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.firstName} {c.lastName}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                </div>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.isActive ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)', whiteSpace: 'nowrap' }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => navigate('/reseller/clients')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-500)', padding: 4 }}
                >
                  <ArrowUpRightIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="sh-card" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '0.875rem' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          <QuickAction label="Manage Clients"  sub="Add or manage your clients" Icon={UserGroupIcon}          color="#6366f1" onClick={() => navigate('/reseller/clients')} />
          <QuickAction label="Single Label"    sub="Generate a label for client" Icon={TagIcon}              color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"     sub="Upload CSV for many labels"  Icon={ClipboardDocumentListIcon} color="#f59e0b" onClick={() => navigate('/labels/bulk')} />
          <QuickAction label="View Carriers"   sub="Browse available services"  Icon={TruckIcon}             color="#22c55e" onClick={() => navigate('/carriers')} />
        </div>
      </div>
    </div>
  );
};

// ── Dashboard (role router) ────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  // Admin goes to /admin
  if (user.role === 'admin') return <Navigate to="/admin" replace />;

  if (user.role === 'reseller') return <ResellerDashboard firstName={user.firstName ?? ''} />;

  return <UserDashboard firstName={user.firstName ?? ''} />;
};

export default Dashboard;
