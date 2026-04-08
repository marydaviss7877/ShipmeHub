import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  SparklesIcon,
  ClockIcon,
  TagIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CreditData {
  creditScore: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  breakdown: {
    base: number;
    accountAge: number;
    labelsGenerated: number;
    depositHistory: number;
    activityBonus: number;
  };
  factors: {
    accountAgeDays: number;
    totalLabels: number;
    totalDeposited: number;
  };
}

// ── Score helpers ──────────────────────────────────────────────────────────────
function scoreLabel(s: number): string {
  if (s >= 800) return 'Excellent';
  if (s >= 740) return 'Very Good';
  if (s >= 670) return 'Good';
  if (s >= 580) return 'Fair';
  return 'Poor';
}

function scoreColor(s: number): string {
  if (s >= 800) return '#22c55e';
  if (s >= 740) return '#3b82f6';
  if (s >= 670) return '#f59e0b';
  if (s >= 580) return '#f97316';
  return '#ef4444';
}


// ── SVG Arc Gauge ──────────────────────────────────────────────────────────────
const ScoreGauge = ({ score }: { score: number }) => {
  const MIN = 300;
  const MAX = 850;
  const pct = (score - MIN) / (MAX - MIN);

  // Arc math: half-circle (180°), radius 80
  const R = 80;
  const CX = 100;
  const CY = 100;
  const START_ANGLE = Math.PI;          // 180°  (left)
  const SWEEP_ANGLE = Math.PI;          // 180°  (half circle)

  const toXY = (angle: number) => ({
    x: CX + R * Math.cos(angle),
    y: CY + R * Math.sin(angle),
  });

  const startPt = toXY(START_ANGLE);
  const endPt   = toXY(START_ANGLE + SWEEP_ANGLE);

  // Track path (grey half-circle)
  const trackD = `M ${startPt.x} ${startPt.y} A ${R} ${R} 0 0 1 ${endPt.x} ${endPt.y}`;

  // Fill path (up to score)
  const fillAngle = START_ANGLE + pct * SWEEP_ANGLE;
  const fillPt    = toXY(fillAngle);
  const largeArc  = pct > 0.5 ? 1 : 0;
  const fillD     = pct === 0 ? '' : `M ${startPt.x} ${startPt.y} A ${R} ${R} 0 ${largeArc} 1 ${fillPt.x} ${fillPt.y}`;

  const color = scoreColor(score);

  return (
    <svg viewBox="20 20 160 100" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
      {/* Track */}
      <path d={trackD} fill="none" stroke="#e2e8f0" strokeWidth="14" strokeLinecap="round" />
      {/* Fill */}
      {pct > 0 && (
        <path d={fillD} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      {/* Score text */}
      <text x={CX} y={CY + 2} textAnchor="middle" fill={color} fontSize="28" fontWeight="900" fontFamily="inherit">
        {score}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" fontFamily="inherit" letterSpacing="1">
        {scoreLabel(score).toUpperCase()}
      </text>
      {/* Range labels */}
      <text x="23" y={CY + 20} textAnchor="start" fill="#94a3b8" fontSize="7.5" fontFamily="inherit">300</text>
      <text x="177" y={CY + 20} textAnchor="end"  fill="#94a3b8" fontSize="7.5" fontFamily="inherit">850</text>
    </svg>
  );
};

// ── Factor Row ─────────────────────────────────────────────────────────────────
const FactorRow = ({
  label, value, maxValue, points, maxPoints, color, Icon, description,
}: {
  label: string; value: string | number; maxValue?: string;
  points: number; maxPoints: number; color: string;
  Icon: React.ElementType; description: string;
}) => {
  const pct = maxPoints > 0 ? Math.min(100, (points / maxPoints) * 100) : 0;
  const [tip, setTip] = useState(false);

  return (
    <div style={{ padding: '0.875rem 0', borderBottom: '1px solid var(--navy-50)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `${color}15`, border: `1px solid ${color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 16, height: 16, color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-700)' }}>{label}</span>
              <button
                onClick={() => setTip(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', lineHeight: 1 }}
              >
                <InformationCircleIcon style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>+{points} pts</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>{value}{maxValue ? ` / ${maxValue}` : ''}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>max {maxPoints} pts</span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
          </div>
          {tip && (
            <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--navy-500)', background: '#f8fafc', borderRadius: 7, padding: '6px 10px', border: '1px solid #e2e8f0' }}>
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── CreditScore Page ───────────────────────────────────────────────────────────
const CreditScore: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData]     = useState<CreditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/stats/credit');
      setData(res.data);
    } catch {
      setError('Unable to load credit score. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="spinner" />
    </div>
  );

  if (error || !data) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--navy-400)' }}>
      <p>{error || 'No data available.'}</p>
      <button className="btn btn-primary" onClick={load}>Retry</button>
    </div>
  );

  const { creditScore, creditLimit, creditUsed, creditAvailable, breakdown, factors } = data;
  const color = scoreColor(creditScore);

  const creditPct = creditLimit > 0 ? Math.min(100, (creditUsed / creditLimit) * 100) : 0;

  const fmt$ = (v: number) =>
    `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1e3a8a 100%)',
        borderRadius: 20, padding: '2rem 2.25rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 60% 80% at 10% 50%, rgba(59,130,246,0.18) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(148,163,184,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Credit Facility
          </p>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em' }}>
            Your Credit Score
          </h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
            Your score determines your eligibility for credit — use labels now, pay later.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.25rem' }}>

        {/* Gauge card */}
        <div className="sh-card" style={{ padding: '1.75rem 1.5rem', textAlign: 'center' }}>
          <ScoreGauge score={creditScore} />
          <div style={{
            marginTop: '0.5rem',
            display: 'inline-block',
            padding: '4px 14px', borderRadius: 99,
            background: `${color}18`, border: `1px solid ${color}28`,
            fontSize: '0.75rem', fontWeight: 800, color,
          }}>
            {scoreLabel(creditScore)}
          </div>

          {/* Score ranges */}
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { range: '800–850', label: 'Excellent', c: '#22c55e' },
              { range: '740–799', label: 'Very Good', c: '#3b82f6' },
              { range: '670–739', label: 'Good',      c: '#f59e0b' },
              { range: '580–669', label: 'Fair',      c: '#f97316' },
              { range: '300–579', label: 'Poor',      c: '#ef4444' },
            ].map(r => (
              <div key={r.range} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)', fontWeight: 600 }}>{r.range}</span>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 800, color: r.c,
                  background: `${r.c}15`, padding: '2px 8px', borderRadius: 99,
                }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score factors */}
        <div className="sh-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)' }}>
            Score Breakdown
          </h3>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'var(--navy-400)' }}>
            Total: {breakdown.base + breakdown.accountAge + breakdown.labelsGenerated + breakdown.depositHistory + breakdown.activityBonus} / 850 points
          </p>

          <FactorRow
            label="Base Score"
            value="Every account starts here"
            points={breakdown.base}
            maxPoints={300}
            color="#64748b"
            Icon={SparklesIcon}
            description="All ShipmeHub accounts start with a base score of 300 points."
          />
          <FactorRow
            label="Account Age"
            value={`${factors.accountAgeDays} days`}
            maxValue="730 days (2 yrs)"
            points={breakdown.accountAge}
            maxPoints={100}
            color="#8b5cf6"
            Icon={ClockIcon}
            description="Older accounts are more trusted. You earn up to 100 points over 2 years of account history."
          />
          <FactorRow
            label="Labels Generated"
            value={`${factors.totalLabels.toLocaleString()} labels`}
            maxValue="500 labels"
            points={breakdown.labelsGenerated}
            maxPoints={200}
            color="#0ea5e9"
            Icon={TagIcon}
            description="The more labels you generate, the higher your score. Full 200 points at 500+ labels."
          />
          <FactorRow
            label="Deposit History"
            value={fmt$(factors.totalDeposited)}
            maxValue="$1,000 deposited"
            points={breakdown.depositHistory}
            maxPoints={200}
            color="#22c55e"
            Icon={BanknotesIcon}
            description="A strong top-up history demonstrates financial reliability. Full 200 points at $1,000+ in total deposits."
          />
          <FactorRow
            label="Activity Bonus"
            value={factors.totalLabels > 0 ? 'Active account' : 'No activity yet'}
            points={breakdown.activityBonus}
            maxPoints={50}
            color="#f59e0b"
            Icon={ArrowTrendingUpIcon}
            description="You earn 50 bonus points simply for having used the platform at least once."
          />
        </div>
      </div>

      {/* Credit Facility card */}
      <div className="sh-card" style={{ padding: '1.5rem 1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)' }}>Credit Facility</h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--navy-400)' }}>
              Use labels now, pay later — up to your credit limit
            </p>
          </div>
          {creditLimit === 0 && (
            <span style={{
              background: '#fef3c7', border: '1px solid #fde68a',
              color: '#92400e', fontSize: '0.68rem', fontWeight: 800,
              padding: '4px 10px', borderRadius: 99,
            }}>
              Not Activated
            </span>
          )}
          {creditLimit > 0 && (
            <span style={{
              background: '#dcfce7', border: '1px solid #bbf7d0',
              color: '#166534', fontSize: '0.68rem', fontWeight: 800,
              padding: '4px 10px', borderRadius: 99,
            }}>
              Active
            </span>
          )}
        </div>

        {creditLimit === 0 ? (
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: 12, padding: '1.25rem',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>
              Credit not yet activated
            </p>
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#b45309', lineHeight: 1.55 }}>
              Your credit score qualifies you to apply for a credit facility. Contact your account manager to request activation.
              Once approved, you can generate labels even when your balance is $0 — up to your credit limit.
            </p>
            <a
              href="mailto:support@shipmehub.com?subject=Credit Facility Request"
              style={{
                display: 'inline-block', padding: '0.55rem 1.25rem',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', borderRadius: 8, textDecoration: 'none',
                fontSize: '0.78rem', fontWeight: 700,
              }}
            >
              Request Credit Activation →
            </a>
          </div>
        ) : (
          <div>
            {/* Three stat boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Credit Limit',     value: fmt$(creditLimit),     color: '#6366f1' },
                { label: 'Credit Used',      value: fmt$(creditUsed),      color: '#ef4444' },
                { label: 'Credit Available', value: fmt$(creditAvailable), color: '#22c55e' },
              ].map(({ label, value, color: c }) => (
                <div key={label} style={{
                  background: `${c}08`, border: `1px solid ${c}20`,
                  borderRadius: 12, padding: '1rem',
                  textAlign: 'center',
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: c }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Usage bar */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--navy-500)' }}>Credit usage</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: creditPct > 80 ? '#ef4444' : 'var(--navy-600)' }}>
                  {creditPct.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  width: `${creditPct}%`, height: '100%', borderRadius: 99,
                  background: creditPct > 80
                    ? 'linear-gradient(90deg, #ef4444, #f97316)'
                    : 'linear-gradient(90deg, #22c55e, #4ade80)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--navy-400)' }}>
              Contact your account manager to increase your credit limit or make a repayment.
            </p>
          </div>
        )}
      </div>

      {/* FAQ / Info */}
      <div className="sh-card" style={{ padding: '1.5rem 1.75rem' }}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-800)' }}>
          How Credit Works
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
          {[
            { q: 'What is credit?', a: 'Credit lets you generate labels even when your balance is $0. You pay back what you used by recharging your account.' },
            { q: 'How is my score calculated?', a: 'Your score is based on account age, labels generated, total deposits made, and account activity. Max score is 850.' },
            { q: 'How do I increase my limit?', a: 'Contact your account manager. Limits are reviewed based on your credit score and shipping history.' },
            { q: 'What happens if I exceed my limit?', a: 'Label generation will pause until you recharge. We will notify you when you are approaching your limit.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: '#f8fafc', borderRadius: 10, padding: '0.875rem 1rem' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)' }}>{q}</p>
              <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--navy-500)', lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--navy-100)', display: 'flex', gap: 12 }}>
          <button
            onClick={() => navigate('/packages')}
            style={{
              background: 'linear-gradient(135deg, #1D4ED8, #6366f1)',
              border: 'none', color: '#fff', padding: '0.6rem 1.25rem',
              borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
            }}
          >
            View Packages →
          </button>
          <a
            href="mailto:support@shipmehub.com?subject=Credit Score Inquiry"
            style={{
              background: '#f1f5f9', border: '1px solid #e2e8f0', color: 'var(--navy-600)',
              padding: '0.6rem 1.25rem', borderRadius: 8, fontWeight: 600,
              fontSize: '0.78rem', textDecoration: 'none',
            }}
          >
            Contact Support
          </a>
        </div>
      </div>

    </div>
  );
};

export default CreditScore;
