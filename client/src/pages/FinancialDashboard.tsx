import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface KPIs {
  totalRevenuePKR: number; totalRevenueUSD: number;
  totalVendorCostPKR: number;
  totalExpensesPKR: number; netProfitPKR: number;
  totalLabels: number; paidLabels: number;
}
interface EquityPartner { name: string; ownershipPercent: number; profitSharePKR: number; }
interface SourceStat { revenueUSD: number; revenuePKR: number; operatingCostPKR: number; profitPKR: number; }
interface CarrierCost { carrier: string; labelCount: number; costUSD: number; costPKR: number; sharePercent: string; }
interface VendorCostRow {
  carrier: string; vendorName: string; labelCount: number;
  costPerLabelUSD: number; totalCostUSD: number; totalCostPKR: number;
}
interface WalletRow {
  walletId: string; walletName: string;
  totalReceivedUSD: number; totalReceivedPKR: number;
  manualCreditsPKR: number; manualDebitsPKR: number; netFlowPKR: number;
}
interface ExpenseBreakdownRow { category: string; type: string; totalPKR: number; count: number; }
interface DashboardData {
  period: { month: number; year: number };
  exchangeRate: number;
  kpis: KPIs;
  equityDistribution: EquityPartner[];
  revenueBySource: { organic: SourceStat; paidAds: SourceStat };
  carrierCostDistribution: CarrierCost[];
  vendorCostDistribution: VendorCostRow[];
  walletSummary: WalletRow[];
  accountSummary: { totalCreditsPKR: number; totalDebitsPKR: number; netFlowPKR: number };
  expenseBreakdown: ExpenseBreakdownRow[];
}
interface PartnerRecord { _id: string; name: string; ownershipPercent: number; isActive: boolean; }

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtPKR = (n: number) => `₨${Math.round(n).toLocaleString('en-PK')}`;
const fmt$   = (n: number) => `$${n.toFixed(2)}`;

const CARRIER_COLORS: Record<string, string> = {
  USPS: '#1D4ED8', UPS: '#B45309', FedEx: '#7C3AED', DHL: '#DC2626',
};

const PIE_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6'];

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
      {children}
    </div>
    {action}
  </div>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="sh-card" style={{ padding: '1.125rem', ...style }}>{children}</div>
);

// Compact KPI tile
const KpiTile: React.FC<{
  label: string; value: string; sub?: string;
  accent: string; bg: string; border: string;
}> = ({ label, value, sub, accent, bg, border }) => (
  <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '0.75rem 1rem' }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: accent, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.68rem', color: accent, opacity: 0.65, marginTop: 2 }}>{sub}</div>}
  </div>
);

// P&L stacked waterfall bar
const PLBar: React.FC<{ kpis: KPIs }> = ({ kpis }) => {
  const rev = Math.max(kpis.totalRevenuePKR, 1);
  const profit = kpis.netProfitPKR;
  const segments = [
    { label: 'Vendor Cost',  value: kpis.totalVendorCostPKR,  color: '#ef4444' },
    { label: 'Expenses',     value: kpis.totalExpensesPKR,     color: '#f97316' },
    { label: profit >= 0 ? 'Net Profit' : 'Net Loss', value: Math.abs(profit), color: profit >= 0 ? '#22c55e' : '#dc2626' },
  ];
  return (
    <>
      <div style={{ height: 20, display: 'flex', borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {segments.map(s => (
          <div
            key={s.label}
            title={`${s.label}: ${fmtPKR(s.value)}`}
            style={{ flex: Math.max(s.value / rev, 0.008), background: s.color, transition: 'flex 0.4s ease', cursor: 'default' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.625rem', flexWrap: 'wrap' }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--navy-600)' }}>
              {s.label}: <strong style={{ color: 'var(--navy-800)' }}>{fmtPKR(s.value)}</strong>
            </span>
          </div>
        ))}
      </div>
    </>
  );
};

// Horizontal percent bar
const BarRow: React.FC<{ label: string; value: number; max: number; color: string; sub?: string }> = ({ label, value, max, color, sub }) => (
  <div style={{ marginBottom: '0.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{fmtPKR(value)}</span>
    </div>
    <div style={{ height: 6, background: 'var(--navy-100)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
    {sub && <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', marginTop: 2 }}>{sub}</div>}
  </div>
);

// Custom pie tooltip
const PieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0];
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 8, padding: '0.5rem 0.75rem', boxShadow: 'var(--shadow-sm)', fontSize: '0.78rem' }}>
        <div style={{ fontWeight: 700, color: 'var(--navy-800)' }}>{d.name}</div>
        <div style={{ color: d.payload.color }}>{d.value.toLocaleString()} labels</div>
      </div>
    );
  }
  return null;
};

// ── Main Component ────────────────────────────────────────────────────────────
const FinancialDashboard: React.FC = () => {
  const { user: authUser } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Partners modal state
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [partners,         setPartners]         = useState<PartnerRecord[]>([]);
  const [partnerForm,      setPartnerForm]      = useState({ name: '', ownershipPercent: '' });
  const [editPartnerId,    setEditPartnerId]    = useState<string | null>(null);
  const [savingPartner,    setSavingPartner]    = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get('/financial-dashboard', {
        params: { month: selectedMonth, year: selectedYear }
      });
      setData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchPartners = useCallback(async () => {
    try {
      const { data: d } = await axios.get('/equity-partners');
      setPartners(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim() || !partnerForm.ownershipPercent) return;
    setSavingPartner(true);
    try {
      const payload = { name: partnerForm.name, ownershipPercent: parseFloat(partnerForm.ownershipPercent) };
      if (editPartnerId) {
        await axios.put(`/equity-partners/${editPartnerId}`, payload);
      } else {
        await axios.post('/equity-partners', payload);
      }
      setPartnerForm({ name: '', ownershipPercent: '' });
      setEditPartnerId(null);
      fetchPartners();
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save partner');
    } finally {
      setSavingPartner(false);
    }
  };

  const deletePartner = async (id: string) => {
    if (!window.confirm('Delete this equity partner?')) return;
    try {
      await axios.delete(`/equity-partners/${id}`);
      fetchPartners();
      fetchData();
    } catch {}
  };

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  if (!authUser || authUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  if (loading || !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div><h1 className="page-title">Financial Dashboard</h1><p className="page-subtitle">Executive P&L Overview</p></div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><div className="spinner" /></div>
    </div>
  );

  const {
    kpis, equityDistribution, revenueBySource, carrierCostDistribution,
    vendorCostDistribution, walletSummary, accountSummary, expenseBreakdown,
  } = data;

  const netPositive = kpis.netProfitPKR >= 0;
  const maxExpense  = expenseBreakdown[0]?.totalPKR || 1;

  // Pie data for carriers
  const carrierPieData = carrierCostDistribution.map(c => ({
    name: c.carrier, value: c.labelCount, color: CARRIER_COLORS[c.carrier] || '#94a3b8',
  }));

  // Pie data for equity
  const equityPieData = equityDistribution.map((p, i) => ({
    name: p.name, value: p.ownershipPercent, color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Financial Dashboard</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            P&L Overview · <strong>{data.exchangeRate.toFixed(1)}</strong> PKR/USD
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setPartnerForm({ name: '', ownershipPercent: '' }); setEditPartnerId(null); setShowPartnerModal(true); }}
          >
            👥 Partners
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.75rem', boxShadow: 'var(--shadow-xs)' }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', fontSize: '1rem', lineHeight: 1, padding: '1px 4px' }}>‹</button>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--navy-800)', minWidth: 120, textAlign: 'center' }}>
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', fontSize: '1rem', lineHeight: 1, padding: '1px 4px' }}>›</button>
          </div>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) repeat(3, 1fr)', gap: '0.5rem' }}>
        <KpiTile label="Total Revenue"   value={fmtPKR(kpis.totalRevenuePKR)}     sub={fmt$(kpis.totalRevenueUSD)} accent="#15803d" bg="var(--success-50)" border="var(--success-100)" />
        <KpiTile label="Net Profit"      value={fmtPKR(kpis.netProfitPKR)}        accent={netPositive ? '#15803d' : '#dc2626'} bg={netPositive ? 'var(--success-50)' : 'var(--danger-50)'} border={netPositive ? 'var(--success-100)' : 'var(--danger-100)'} />
        <KpiTile label="Total Labels"    value={kpis.totalLabels.toLocaleString()} accent="#1d4ed8" bg="var(--accent-50)" border="var(--accent-100)" />
        <KpiTile label="Paid Labels Est" value={kpis.paidLabels.toLocaleString()}  accent="#4338ca" bg="var(--accent-50)" border="var(--accent-100)" />
        <KpiTile label="Vendor Cost"     value={fmtPKR(kpis.totalVendorCostPKR)}  accent="#dc2626" bg="var(--danger-50)" border="var(--danger-100)" />
        <KpiTile label="Other Expenses"  value={fmtPKR(kpis.totalExpensesPKR)}    accent="#c2410c" bg="var(--warning-50)" border="var(--warning-100)" />
      </div>

      {/* ── P&L Waterfall + Revenue by Source ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '0.875rem' }}>

        {/* P&L visual bar */}
        <Card>
          <SectionLabel>P&L Composition</SectionLabel>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>Total Revenue</span>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#15803d' }}>
                {fmtPKR(kpis.totalRevenuePKR)}
                <span style={{ fontSize: '0.68rem', fontWeight: 400, opacity: 0.7, marginLeft: 5 }}>{fmt$(kpis.totalRevenueUSD)}</span>
              </span>
            </div>
            <PLBar kpis={kpis} />
          </div>
          {/* Account summary inline */}
          <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '0.75rem', display: 'flex', gap: '1.5rem' }}>
            {[
              { label: 'Cash In', value: accountSummary.totalCreditsPKR, color: '#15803d' },
              { label: 'Cash Out', value: accountSummary.totalDebitsPKR, color: '#dc2626' },
              { label: 'Net Flow', value: accountSummary.netFlowPKR, color: accountSummary.netFlowPKR >= 0 ? '#15803d' : '#dc2626' },
            ].map(r => (
              <div key={r.label}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.label}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: r.color }}>{fmtPKR(r.value)}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue by Source */}
        <Card>
          <SectionLabel>Revenue by Source</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {([
              { key: 'organic', label: 'Organic',  color: '#15803d', bg: 'var(--success-50)', border: 'var(--success-100)', costLabel: 'Ad Spend' },
              { key: 'paidAds', label: 'Paid Ads', color: '#1d4ed8', bg: 'var(--accent-50)', border: 'var(--accent-100)', costLabel: 'Ad Spend' },
            ] as const).map(({ key, label, color, bg, border, costLabel }) => {
              const s = revenueBySource[key];
              const margin = s.revenuePKR > 0 ? ((s.profitPKR / s.revenuePKR) * 100) : 0;
              return (
                <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '0.75rem 0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: s.profitPKR >= 0 ? '#15803d' : '#dc2626',
                      background: s.profitPKR >= 0 ? 'var(--success-100)' : 'var(--danger-100)', padding: '1px 6px', borderRadius: 10 }}>
                      {margin.toFixed(1)}% margin
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--navy-600)' }}>Revenue</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{fmtPKR(s.revenuePKR)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>− {costLabel}</span>
                      <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{fmtPKR(s.operatingCostPKR)}</span>
                    </div>
                    <div style={{ height: 4, background: `${color}22`, borderRadius: 2, overflow: 'hidden', margin: '2px 0' }}>
                      <div style={{ height: '100%', width: `${Math.min(Math.max(margin, 0), 100)}%`, background: color, borderRadius: 2 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>Gross Profit</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: s.profitPKR >= 0 ? '#15803d' : '#dc2626' }}>{fmtPKR(s.profitPKR)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Carrier Distribution + Expense Breakdown ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>

        {/* Carrier donut chart */}
        <Card>
          <SectionLabel>Carrier Distribution</SectionLabel>
          {carrierPieData.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', margin: 0 }}>No label data for this period.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie
                    data={carrierPieData}
                    cx="50%" cy="50%"
                    innerRadius={38} outerRadius={58}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {carrierPieData.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {carrierCostDistribution.map(c => (
                  <div key={c.carrier}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: CARRIER_COLORS[c.carrier] || '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)' }}>{c.carrier}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{c.sharePercent}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14 }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>{c.labelCount.toLocaleString()} labels</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626' }}>{fmtPKR(c.costPKR)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor cost table beneath */}
          {vendorCostDistribution.length > 0 && (
            <div style={{ marginTop: '0.875rem', borderTop: '1px solid var(--navy-100)', paddingTop: '0.75rem' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Vendor Breakdown</div>
              {vendorCostDistribution.map((v, i) => (
                <div key={`${v.carrier}-${v.vendorName}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: i < vendorCostDistribution.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy-700)' }}>{v.vendorName}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)' }}>{v.carrier} · {fmt$(v.costPerLabelUSD)}/label · {v.labelCount.toLocaleString()} labels</div>
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' }}>{fmtPKR(v.totalCostPKR)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <SectionLabel>Expense Breakdown</SectionLabel>
          {expenseBreakdown.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--navy-400)', margin: 0 }}>No expense entries this period.</p>
          ) : (
            <>
              {expenseBreakdown.map(e => (
                <BarRow
                  key={e.category}
                  label={e.category}
                  value={e.totalPKR}
                  max={maxExpense}
                  color="#f97316"
                  sub={`${e.count} entr${e.count !== 1 ? 'ies' : 'y'}`}
                />
              ))}
              <div style={{ borderTop: '1px solid var(--navy-100)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-700)' }}>Total Expenses</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#dc2626' }}>{fmtPKR(kpis.totalExpensesPKR)}</span>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Equity Distribution + Wallet Summary ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: equityDistribution.length > 0 && walletSummary.length > 0 ? '1fr 2fr' : '1fr', gap: '0.875rem' }}>

        {/* Equity distribution */}
        {equityDistribution.length > 0 && (
          <Card>
            <SectionLabel>Equity Distribution</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              {equityPieData.length > 0 && (
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie data={equityPieData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {equityPieData.map((e, i) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <RTooltip formatter={(val: any, name: any) => [`${val}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {equityDistribution.map((p, i) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-800)' }}>{p.name}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: PIE_COLORS[i % PIE_COLORS.length] }}>{p.ownershipPercent}%</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: p.profitSharePKR >= 0 ? '#15803d' : '#dc2626' }}>{fmtPKR(p.profitSharePKR)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Wallet Summary */}
        {walletSummary.length > 0 && (
          <Card>
            <SectionLabel>Wallet Summary</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.625rem' }}>
              {walletSummary.map(w => (
                <div key={w.walletId} style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 9, padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>{w.walletName}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>Received</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d' }}>{fmtPKR(w.totalReceivedPKR)}</span>
                    </div>
                    {w.manualCreditsPKR > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>+ Manual</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#15803d' }}>+{fmtPKR(w.manualCreditsPKR)}</span>
                      </div>
                    )}
                    {w.manualDebitsPKR > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>− Debits</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626' }}>−{fmtPKR(w.manualDebitsPKR)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-700)' }}>Net Flow</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: w.netFlowPKR >= 0 ? '#15803d' : '#dc2626' }}>{fmtPKR(w.netFlowPKR)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ── Partner Management Modal ────────────────────────────────────────── */}
      {showPartnerModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPartnerModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Equity Partners</h2>
              <button onClick={() => setShowPartnerModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* Add / Edit form */}
            <div style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: '0.625rem' }}>
                {editPartnerId ? 'Edit Partner' : 'Add Equity Partner'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-input" value={partnerForm.name} onChange={e => setPartnerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. AHSAN" />
                </div>
                <div>
                  <label className="form-label">Ownership %</label>
                  <input type="number" min="0" max="100" step="0.1" className="form-input" value={partnerForm.ownershipPercent} onChange={e => setPartnerForm(f => ({ ...f, ownershipPercent: e.target.value }))} placeholder="50" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {editPartnerId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditPartnerId(null); setPartnerForm({ name: '', ownershipPercent: '' }); }}>Cancel</button>
                )}
                <button className="btn btn-primary btn-sm" disabled={savingPartner || !partnerForm.name.trim()} onClick={handleSavePartner}>
                  {savingPartner ? 'Saving…' : editPartnerId ? 'Update' : '+ Add'}
                </button>
              </div>
            </div>

            {/* Partner list */}
            {partners.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>No equity partners configured.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {partners.map(p => (
                  <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--navy-100)', borderRadius: 8, padding: '0.625rem 0.875rem' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--navy-800)' }}>{p.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-600)', marginLeft: 8 }}>{p.ownershipPercent}%</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditPartnerId(p._id); setPartnerForm({ name: p.name, ownershipPercent: String(p.ownershipPercent) }); }}>✎</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => deletePartner(p._id)}>🗑</button>
                  </div>
                ))}
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-400)', marginTop: '0.25rem' }}>
                  Total: {partners.reduce((s, p) => s + p.ownershipPercent, 0).toFixed(1)}% allocated
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default FinancialDashboard;
