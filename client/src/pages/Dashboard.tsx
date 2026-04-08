import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  CurrencyDollarIcon, TagIcon, ClipboardDocumentListIcon,
  UserGroupIcon, ArrowUpRightIcon, ClockIcon, SparklesIcon,
  InformationCircleIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserStats {
  balance: { currentBalance: number; totalDeposited: number; totalSpent: number };
  labels:  { total: number; generated: number; failed: number; spent: number; byCarrier: Record<string, number> };
  manifests: { total: number; active: number; completed: number; cancelled: number };
  savings: { total: number; labelCount: number };
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

const CARRIER_GRADIENT: Record<string, string> = {
  USPS: 'linear-gradient(90deg, #1D4ED8, #60A5FA)',
  UPS:  'linear-gradient(90deg, #92400E, #F59E0B)',
  FedEx:'linear-gradient(90deg, #5B21B6, #A78BFA)',
  DHL:  'linear-gradient(90deg, #B45309, #FCD34D)',
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

// ── MetricCard ────────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, sub, color, Icon, onClick, infoTooltip,
}: {
  label: string; value: string | number; sub?: string;
  color: string; Icon: React.ElementType; onClick?: () => void;
  infoTooltip?: string;
}) => {
  const [showTip, setShowTip] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: '1.25rem 1.3rem 1.1rem',
        display: 'flex', flexDirection: 'column',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        boxShadow: hovered
          ? '0 8px 28px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)'
          : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        transform: hovered && onClick ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      {/* Top gradient accent strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, ${color}70)`,
        borderRadius: '16px 16px 0 0',
      }} />

      {/* Icon row + optional info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: `linear-gradient(135deg, ${color}22, ${color}0d)`,
          border: `1px solid ${color}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon style={{ width: 19, height: 19, color }} />
        </div>

        {infoTooltip && (
          <div
            style={{ position: 'relative', lineHeight: 1, marginTop: 3 }}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={e => e.stopPropagation()}
          >
            <InformationCircleIcon style={{ width: 14, height: 14, color: '#cbd5e1', cursor: 'help' }} />
            {showTip && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                background: '#1e293b', color: '#f1f5f9',
                borderRadius: 10, padding: '10px 13px',
                fontSize: '0.69rem', lineHeight: 1.6, fontWeight: 400,
                width: 252, boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
                pointerEvents: 'none',
              }}>
                {infoTooltip}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: '1.85rem', fontWeight: 800, color: 'var(--navy-900)',
        letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 4,
      }}>
        {value}
      </div>

      {/* Label */}
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </div>

      {/* Sub — separated */}
      {sub && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--navy-100)',
          fontSize: '0.7rem', color: 'var(--navy-400)',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
};

// ── QuickAction ───────────────────────────────────────────────────────────────
const QuickAction = ({ label, sub, Icon, color, onClick }: {
  label: string; sub: string; Icon: React.ElementType; color: string; onClick: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '0.9rem 1rem', borderRadius: 12,
        border: `1.5px solid ${hovered ? color + '55' : 'var(--navy-100)'}`,
        background: hovered ? `${color}08` : '#fff',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.15s',
        boxShadow: hovered ? `0 4px 14px ${color}22` : 'none',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${color}22, ${color}0e)`,
        border: `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon style={{ width: 17, height: 17, color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--navy-800)' }}>{label}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>{sub}</div>
      </div>
      <ArrowUpRightIcon style={{
        width: 15, height: 15,
        color: hovered ? color : 'var(--navy-300)',
        transform: hovered ? 'translate(1px,-1px)' : 'none',
        transition: 'color 0.15s, transform 0.15s',
        flexShrink: 0,
      }} />
    </button>
  );
};

// ── Section header with left accent bar ───────────────────────────────────────
const SectionHeader = ({ title, action, accent = 'var(--accent-500)' }: {
  title: string; action?: React.ReactNode; accent?: string;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 3, height: 16, borderRadius: 3, background: accent, flexShrink: 0 }} />
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>{title}</h3>
    </div>
    {action}
  </div>
);

// ── Hero Banner (shared) ───────────────────────────────────────────────────────
const HeroBanner = ({ greeting, name, dateLabel, balanceLabel, balance, onCta }: {
  greeting: string; name: string; dateLabel: string;
  balanceLabel: string; balance: string; onCta: () => void;
}) => (
  <div style={{
    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 58%, #1e3a8a 100%)',
    borderRadius: 20, padding: '1.75rem 2rem',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
  }}>
    {/* Radial glow blobs */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 60% 80% at 10% 50%, rgba(59,130,246,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 60% at 90% 20%, rgba(139,92,246,0.13) 0%, transparent 70%)',
    }} />
    {/* Dot-grid texture */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.1,
      backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
      backgroundSize: '22px 22px',
    }} />

    <div style={{ position: 'relative', zIndex: 1 }}>
      <p style={{ color: 'rgba(148,163,184,0.72)', fontSize: '0.75rem', fontWeight: 500, margin: '0 0 5px', letterSpacing: '0.02em' }}>
        {dateLabel}
      </p>
      <h1 style={{ color: '#fff', fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 6px' }}>
        {greeting}, {name}!
      </h1>
      <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: 0 }}>
        Here's your shipping activity overview.
      </p>
    </div>

    <div style={{ position: 'relative', zIndex: 1, textAlign: 'right', flexShrink: 0 }}>
      <p style={{ color: 'rgba(148,163,184,0.62)', fontSize: '0.68rem', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {balanceLabel}
      </p>
      <p style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
        {balance}
      </p>
      <button
        onClick={onCta}
        style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          color: '#fff', padding: '6px 18px', borderRadius: 8,
          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        Add Balance →
      </button>
    </div>
  </div>
);

// ── AddBalanceModal ───────────────────────────────────────────────────────────
const AddBalanceModal = ({
  open, onClose, onViewPackages,
}: { open: boolean; onClose: () => void; onViewPackages: () => void }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, padding: '2rem 2.25rem',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #22c55e22, #22c55e0d)', border: '1px solid #22c55e28',
            }}>
              <CurrencyDollarIcon style={{ width: 22, height: 22, color: '#22c55e' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-800)' }}>Add Balance</h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--navy-400)' }}>Account top-up</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.2rem', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Message */}
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
          padding: '1rem 1.25rem', marginBottom: '1.25rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.87rem', color: '#166534', fontWeight: 600, marginBottom: 4 }}>
            Ready to recharge?
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#15803d', lineHeight: 1.55 }}>
            To add balance to your account, please contact your <strong>account manager</strong> or our <strong>sales team</strong>. They will process your top-up and confirm once funds are credited.
          </p>
        </div>

        {/* Contact options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem' }}>
          <a
            href="mailto:support@shipmehub.com"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.75rem 1rem', borderRadius: 10,
              background: '#f8fafc', border: '1px solid #e2e8f0',
              color: 'var(--navy-700)', textDecoration: 'none',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '1rem' }}>📧</span>
            support@shipmehub.com
          </a>
          <a
            href="https://wa.me/message/shipmehub"
            target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.75rem 1rem', borderRadius: 10,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              color: '#166534', textDecoration: 'none',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <span style={{ fontSize: '1rem' }}>💬</span>
            WhatsApp Support
          </a>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onViewPackages}
            style={{
              flex: 1, padding: '0.65rem', borderRadius: 10,
              background: 'linear-gradient(135deg, #1D4ED8, #6366f1)',
              border: 'none', color: '#fff', fontWeight: 700,
              fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            View Packages →
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '0.65rem', borderRadius: 10,
              background: '#f1f5f9', border: '1px solid #e2e8f0',
              color: 'var(--navy-600)', fontWeight: 600,
              fontSize: '0.82rem', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── User Dashboard ─────────────────────────────────────────────────────────────
const UserDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState<UserStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);

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

  const { balance, labels, manifests, savings, recentLabels, activeManifests } = stats;
  const totalLabels = labels.total || 1;
  const roi = balance.totalDeposited > 0 ? ((savings?.total ?? 0) / balance.totalDeposited) * 100 : 0;
  const SAVINGS_TOOLTIP = 'This figure compares your label cost against standard USPS retail rates. Your actual savings may differ if you had prior negotiated rates. Think of this as an estimated benchmark — not a guaranteed fixed saving.';
  const now = new Date();
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero */}
      <HeroBanner
        greeting={greeting} name={firstName} dateLabel={dateLabel}
        balanceLabel="Current Balance" balance={fmt$(balance.currentBalance)}
        onCta={() => setShowAddBalance(true)}
      />

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.875rem' }}>
        <MetricCard label="Balance"          value={fmt$(balance.currentBalance)} sub={`${fmt$(balance.totalDeposited)} deposited`}                                       color="#22c55e" Icon={CurrencyDollarIcon}      onClick={() => navigate('/profile')} />
        <MetricCard label="Labels Generated" value={labels.generated}             sub={`${labels.failed} failed`}                                                         color="#0ea5e9" Icon={TagIcon}                 onClick={() => navigate('/labels/history')} />
        <MetricCard label="Active Manifests" value={manifests.active}             sub={`${manifests.completed} completed`}                                                color="#f59e0b" Icon={ClipboardDocumentListIcon} />
        <MetricCard label="Total Spent"      value={fmt$(balance.totalSpent)}     sub="Labels + manifests"                                                               color="#6366f1" Icon={CurrencyDollarIcon} />
        <MetricCard label="Total Savings"    value={fmt$(savings?.total ?? 0)}    sub={savings?.labelCount ? `vs USPS retail · ${savings.labelCount} labels` : 'vs USPS retail'} color="#10b981" Icon={SparklesIcon} infoTooltip={SAVINGS_TOOLTIP} />
        <MetricCard label="ROI"              value={`${roi.toFixed(1)}%`}         sub={`${fmt$(savings?.total ?? 0)} saved · ${fmt$(balance.totalDeposited)} deposited`} color="#8b5cf6" Icon={ArrowTrendingUpIcon} />
      </div>

      {/* Mid row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Labels by Carrier */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="Labels by Carrier" accent="#1D4ED8" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {['USPS','UPS','FedEx','DHL'].map(c => {
              const count = labels.byCarrier[c] || 0;
              const pct   = Math.round((count / totalLabels) * 100);
              return (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-400)' }}>{count} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '1rem', paddingTop: '0.875rem', borderTop: '1px solid var(--navy-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--navy-400)' }}>Total Labels</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)' }}>{labels.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Active Manifest Jobs */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader
            title="Active Manifest Jobs"
            accent="#f59e0b"
            action={
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => navigate('/labels/bulk')}>
                Submit Job →
              </button>
            }
          />
          {activeManifests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.75rem 0', color: 'var(--navy-400)', fontSize: '0.82rem' }}>
              No active jobs.{' '}
              <button onClick={() => navigate('/labels/bulk')} style={{ background: 'none', border: 'none', color: 'var(--accent-600)', cursor: 'pointer', fontWeight: 600 }}>
                Submit one →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {activeManifests.map((job: any) => (
                <div
                  key={job._id}
                  onClick={() => navigate('/labels/bulk')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.6rem 0.75rem',
                    background: 'var(--navy-50)', borderRadius: 10,
                    cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = '#eff6ff'; el.style.borderColor = '#bfdbfe'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'var(--navy-50)'; el.style.borderColor = 'transparent'; }}
                >
                  <span className={`carrier-badge ${job.carrier?.toLowerCase()}`} style={{ flexShrink: 0 }}>{job.carrier}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-800)' }}>{job.userBilling?.labelCount ?? '?'} labels</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{job.assignedVendor?.name ?? 'Unassigned'}</div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                    background: `${MANIFEST_STATUS_COLOR[job.status] || '#94a3b8'}18`,
                    color: MANIFEST_STATUS_COLOR[job.status] || '#64748b',
                  }}>
                    {MANIFEST_STATUS_LABEL[job.status] || job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Labels */}
      <div className="sh-card">
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 3, height: 16, borderRadius: 3, background: '#0ea5e9' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Recent Labels</h3>
          </div>
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
                        fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        background: lbl.status === 'generated' ? '#f0fdf4' : '#fef2f2',
                        color:      lbl.status === 'generated' ? '#16a34a' : '#dc2626',
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
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader title="Quick Actions" accent="var(--accent-500)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <QuickAction label="Single Label"  sub="Generate one label now"    Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"   sub="Upload CSV, generate many" Icon={ClipboardDocumentListIcon} color="#6366f1" onClick={() => navigate('/labels/bulk')} />
          <QuickAction label="Label History" sub="View all generated labels" Icon={ClockIcon}                 color="#f59e0b" onClick={() => navigate('/labels/history')} />
        </div>
      </div>

      {/* Add Balance Modal */}
      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} onViewPackages={() => { setShowAddBalance(false); navigate('/packages'); }} />
    </div>
  );
};

// ── Reseller Dashboard ────────────────────────────────────────────────────────
const ResellerDashboard: React.FC<{ firstName: string }> = ({ firstName }) => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState<ResellerStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showAddBalance, setShowAddBalance] = useState(false);

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
  const greeting  = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero */}
      <HeroBanner
        greeting={greeting} name={firstName} dateLabel={dateLabel}
        balanceLabel="My Balance" balance={fmt$(myBalance.currentBalance)}
        onCta={() => setShowAddBalance(true)}
      />

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.875rem' }}>
        <MetricCard label="My Balance"    value={fmt$(myBalance.currentBalance)} sub={`${fmt$(myBalance.totalDeposited)} deposited`} color="#22c55e" Icon={CurrencyDollarIcon} onClick={() => navigate('/profile')} />
        <MetricCard label="Total Clients" value={clientCount}                    sub={`${activeClients} active`}                    color="#6366f1" Icon={UserGroupIcon}       onClick={() => navigate('/reseller/clients')} />
        <MetricCard label="Client Labels" value={labels.total}                   sub="Generated by clients"                         color="#0ea5e9" Icon={TagIcon} />
        <MetricCard label="Client Spend"  value={fmt$(totalClientSpend)}         sub="Labels + manifest jobs"                       color="#f59e0b" Icon={CurrencyDollarIcon} />
      </div>

      {/* Mid row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* My Balance */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="My Balance" accent="#22c55e" />
          {[
            { label: 'Available Balance', val: fmt$(myBalance.currentBalance), color: '#22c55e' },
            { label: 'Total Deposited',   val: fmt$(myBalance.totalDeposited), color: '#6366f1' },
            { label: 'Total Spent',       val: fmt$(myBalance.totalSpent),     color: '#ef4444' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.65rem 0', borderBottom: '1px solid var(--navy-50)',
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--navy-500)' }}>{label}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Client Activity */}
        <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
          <SectionHeader title="Client Activity" accent="#6366f1" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {['USPS','UPS','FedEx','DHL'].map(c => {
              const count = labels.byCarrier?.[c] || 0;
              const pct   = Math.round((count / totalLabels) * 100);
              return (
                <div key={c}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)' }}>{c}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-400)' }}>{count} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: CARRIER_GRADIENT[c] || CARRIER_COLORS[c], borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--navy-100)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Active Jobs',      val: manifests.active,        color: '#f59e0b' },
              { label: 'Completed Jobs',   val: manifests.completed,     color: '#22c55e' },
              { label: 'Total Manifests',  val: manifests.total,         color: 'var(--navy-700)' },
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 3, height: 16, borderRadius: 3, background: '#6366f1' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>My Clients</h3>
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
              <div
                key={c._id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--navy-50)', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
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
                <button onClick={() => navigate('/reseller/clients')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-500)', padding: 4 }}>
                  <ArrowUpRightIcon style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="sh-card" style={{ padding: '1.3rem 1.5rem' }}>
        <SectionHeader title="Quick Actions" accent="var(--accent-500)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <QuickAction label="Manage Clients" sub="Add or manage your clients"  Icon={UserGroupIcon}              color="#6366f1" onClick={() => navigate('/reseller/clients')} />
          <QuickAction label="Single Label"   sub="Generate a label for client" Icon={TagIcon}                   color="#0ea5e9" onClick={() => navigate('/labels/single')} />
          <QuickAction label="Bulk Labels"    sub="Upload CSV for many labels"  Icon={ClipboardDocumentListIcon} color="#f59e0b" onClick={() => navigate('/labels/bulk')} />
        </div>
      </div>

      {/* Add Balance Modal */}
      <AddBalanceModal open={showAddBalance} onClose={() => setShowAddBalance(false)} onViewPackages={() => { setShowAddBalance(false); navigate('/packages'); }} />
    </div>
  );
};

// ── Dashboard (role router) ────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'reseller') return <ResellerDashboard firstName={user.firstName ?? ''} />;
  return <UserDashboard firstName={user.firstName ?? ''} />;
};

export default Dashboard;
