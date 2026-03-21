import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface ClientStat {
  clientId: string;
  name: string;
  email: string;
  isActive: boolean;
  clientRate: number;
  clientPaidUSD: number;
  estimatedLabels: number;
  clientRevUSD: number;
  clientLabelCount: number;
  incentivePKR: number;
}

interface VendorFormula {
  _id?: string;
  carrier: string;
  vendorName: string;
  incentiveThreshold: number;
  incentiveRsPerUnit: number;
  isActive: boolean;
}

interface AgentStats {
  _id: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    clients: any[];
  };
  baseSalaryPKR: number;
  incentiveThreshold: number;
  incentiveRsPerUnit: number;
  vendorFormulas: VendorFormula[];
  isActive: boolean;
  salaryLogs: any[];
  notes: string;
  stats?: {
    totalDepositsUSD: number;
    totalRevenueUSD: number;
    totalLabelCount: number;
    grossProfitPKR: number;
    totalIncentivePKR: number;
    baseSalaryPKR: number;
    totalExpensePKR: number;
    netProfitPKR: number;
    clients: ClientStat[];
  };
  rank?: number;
}

interface SalesConfig {
  defaultThreshold: number;
  defaultRsPerUnit: number;
}

interface LiveRate {
  rate: number;
  source: 'live' | 'cache' | 'stale' | 'fallback';
  fetchedAt: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtPKR = (n: number) =>
  `\u20a8${Math.round(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

const fmt$ = (n: number) => `$${n.toFixed(2)}`;

const initials = (first: string, last: string) =>
  `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase();

const MEDAL_COLORS = [
  { border: '#F59E0B', bg: '#FFFBEB', text: '#92400E', medal: '🥇' },
  { border: '#94A3B8', bg: '#F8FAFC', text: '#475569', medal: '🥈' },
  { border: '#CD7C2F', bg: '#FEF3C7', text: '#78350F', medal: '🥉' },
];

// ── Main Component ────────────────────────────────────────────────────────────

const SalesAgents: React.FC = () => {
  const { user: authUser } = useAuth();

  // ── Date selectors
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

  // ── Data
  const [agents,       setAgents]       = useState<AgentStats[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [config,       setConfig]       = useState<SalesConfig>({
    defaultThreshold: 0.40,
    defaultRsPerUnit: 1.0,
  });
  const [liveRate,     setLiveRate]     = useState<LiveRate | null>(null);
  const [loadingRate,  setLoadingRate]  = useState(false);

  // ── Modals / selected agent
  const [selectedAgent, setSelectedAgent] = useState<AgentStats | null>(null);
  const [activeTab,     setActiveTab]     = useState<'overview' | 'clients' | 'salary' | 'formula'>('overview');

  const [showTagModal,    setShowTagModal]    = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // ── Wallet management
  const [wallets,        setWallets]        = useState<{ _id: string; name: string; description: string; isActive: boolean }[]>([]);
  const [walletForm,     setWalletForm]     = useState({ name: '', description: '' });
  const [editWalletId,   setEditWalletId]   = useState<string | null>(null);
  const [savingWallet,   setSavingWallet]   = useState(false);

  // ── Resellers for tag modal
  const [allResellers,   setAllResellers]   = useState<any[]>([]);

  // ── Tag modal form state
  const [tagForm, setTagForm] = useState({
    userId: '',
    baseSalaryPKR: 0,
    incentiveThreshold: 0.40,
    incentiveRsPerUnit: 1.0,
    notes: '',
  });

  // ── Config modal form state
  const [configForm, setConfigForm] = useState<SalesConfig>({
    defaultThreshold: 0.40,
    defaultRsPerUnit: 1.0,
  });

  // ── Formula / edit state inside detail modal
  const [formulaForm, setFormulaForm] = useState({
    baseSalaryPKR: 0,
    incentiveThreshold: 0.40,
    incentiveRsPerUnit: 1.0,
    notes: '',
  });
  const [vendorFormulaRows, setVendorFormulaRows] = useState<VendorFormula[]>([]);

  // ── Salary log form
  const [showLogForm,  setShowLogForm]  = useState(false);
  const [logForm,      setLogForm]      = useState({
    month: selectedMonth,
    year:  selectedYear,
    baseSalaryPaid:  0,
    incentivePaid:   0,
    note: '',
  });

  // ── Saving flags
  const [savingFormula,  setSavingFormula]  = useState(false);
  const [savingConfig,   setSavingConfig]   = useState(false);
  const [savingTag,      setSavingTag]      = useState(false);
  const [savingLog,      setSavingLog]      = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await axios.get('/sales-agents/config');
      setConfig(data);
      setConfigForm({
        defaultThreshold: data.defaultThreshold,
        defaultRsPerUnit: data.defaultRsPerUnit,
      });
    } catch (err) {
      console.error('Failed to load sales config', err);
    }
  }, []);

  const fetchLiveRate = useCallback(async () => {
    setLoadingRate(true);
    try {
      const { data } = await axios.get('/sales-agents/exchange-rate');
      setLiveRate(data);
    } catch (err) {
      console.error('Failed to fetch live rate', err);
    } finally {
      setLoadingRate(false);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/sales-agents', {
        params: { month: selectedMonth, year: selectedYear },
      });
      // Backend returns { agents, usdToPkrRate, rateSource }
      const agentList = Array.isArray(data) ? data : data.agents ?? [];
      setAgents(agentList);
    } catch (err) {
      console.error('Failed to load agents', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  const fetchResellers = useCallback(async () => {
    try {
      const { data } = await axios.get('/users', { params: { role: 'reseller', limit: 200 } });
      const users: any[] = Array.isArray(data) ? data : data.users ?? [];
      // Filter out those already tagged
      const taggedIds = new Set(agents.map((a) => a.user._id));
      setAllResellers(users.filter((u: any) => !taggedIds.has(u._id ?? u.id)));
    } catch (err) {
      console.error('Failed to load resellers', err);
    }
  }, [agents]);

  useEffect(() => {
    fetchConfig();
    fetchLiveRate();
    fetchWallets();
  }, [fetchConfig, fetchLiveRate]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const fetchWallets = async () => {
    try {
      const { data } = await axios.get('/wallets');
      setWallets(data.wallets || []);
    } catch {}
  };

  const handleSaveWallet = async () => {
    if (!walletForm.name.trim()) return;
    setSavingWallet(true);
    try {
      if (editWalletId) {
        await axios.put(`/wallets/${editWalletId}`, walletForm);
      } else {
        await axios.post('/wallets', walletForm);
      }
      setWalletForm({ name: '', description: '' });
      setEditWalletId(null);
      fetchWallets();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save wallet');
    } finally {
      setSavingWallet(false);
    }
  };

  const handleToggleWallet = async (id: string, isActive: boolean) => {
    try {
      await axios.put(`/wallets/${id}`, { isActive: !isActive });
      fetchWallets();
    } catch {}
  };

  const handleDeleteWallet = async (id: string) => {
    if (!window.confirm('Delete this wallet?')) return;
    try {
      await axios.delete(`/wallets/${id}`);
      fetchWallets();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete wallet');
    }
  };

  // ── Month navigation ───────────────────────────────────────────────────────

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ── Summary KPIs ───────────────────────────────────────────────────────────

  const totalAgents       = agents.length;
  const sumRevUSD         = agents.reduce((s, a) => s + (a.stats?.totalRevenueUSD  || 0), 0);
  const sumSalaryPKR      = agents.reduce((s, a) => s + (a.stats?.baseSalaryPKR    || 0), 0);
  const sumIncentivePKR   = agents.reduce((s, a) => s + (a.stats?.totalIncentivePKR || 0), 0);
  const sumNetProfitPKR   = agents.reduce((s, a) => s + (a.stats?.netProfitPKR     || 0), 0);

  // ── Actions ────────────────────────────────────────────────────────────────

  const openTagModal = () => {
    fetchResellers();
    setTagForm({ userId: '', baseSalaryPKR: 0, incentiveThreshold: 0.40, incentiveRsPerUnit: 1.0, notes: '' });
    setShowTagModal(true);
  };

  const handleTagAgent = async () => {
    if (!tagForm.userId) return;
    setSavingTag(true);
    try {
      await axios.post('/sales-agents', tagForm);
      setShowTagModal(false);
      fetchAgents();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to tag agent');
    } finally {
      setSavingTag(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { data } = await axios.put('/sales-agents/config', {
        defaultThreshold: configForm.defaultThreshold,
        defaultRsPerUnit: configForm.defaultRsPerUnit,
      });
      setConfig(data);
      setShowConfigModal(false);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  };

  const openAgentDetail = (agent: AgentStats) => {
    setSelectedAgent(agent);
    setActiveTab('overview');
    setFormulaForm({
      baseSalaryPKR:      agent.baseSalaryPKR,
      incentiveThreshold: agent.incentiveThreshold,
      incentiveRsPerUnit: agent.incentiveRsPerUnit,
      notes:              agent.notes,
    });
    setVendorFormulaRows(agent.vendorFormulas || []);
    setShowLogForm(false);
    setLogForm({ month: selectedMonth, year: selectedYear, baseSalaryPaid: 0, incentivePaid: 0, note: '' });
  };

  const handleSaveFormula = async () => {
    if (!selectedAgent) return;
    setSavingFormula(true);
    try {
      const [formulaRes] = await Promise.all([
        axios.put(`/sales-agents/${selectedAgent._id}`, formulaForm),
        axios.put(`/sales-agents/${selectedAgent._id}/vendor-formulas`, { vendorFormulas: vendorFormulaRows }),
      ]);
      const updatedAgent: AgentStats = {
        ...selectedAgent,
        ...formulaRes.data,
        vendorFormulas: vendorFormulaRows,
        stats: selectedAgent.stats,
      };
      setSelectedAgent(updatedAgent);
      setAgents(prev => prev.map(a =>
        a._id === selectedAgent._id ? { ...a, ...formulaRes.data, vendorFormulas: vendorFormulaRows } : a
      ));
      setActiveTab('overview');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save formula');
    } finally {
      setSavingFormula(false);
    }
  };

  const handleAddVendorFormulaRow = () => {
    setVendorFormulaRows(rows => [
      ...rows,
      { carrier: 'USPS', vendorName: '', incentiveThreshold: 0.40, incentiveRsPerUnit: 1.0, isActive: true },
    ]);
  };

  const updateVendorFormulaRow = (i: number, field: string, value: any) => {
    setVendorFormulaRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const removeVendorFormulaRow = (i: number) => {
    setVendorFormulaRows(rows => rows.filter((_, idx) => idx !== i));
  };

  const handleSoftDelete = async (agentId: string) => {
    if (!window.confirm('Deactivate this sales agent?')) return;
    try {
      await axios.delete(`/sales-agents/${agentId}`);
      setAgents(prev => prev.filter(a => a._id !== agentId));
      if (selectedAgent?._id === agentId) setSelectedAgent(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to deactivate');
    }
  };

  const handleAddLog = async () => {
    if (!selectedAgent) return;
    setSavingLog(true);
    try {
      const { data } = await axios.post(`/sales-agents/${selectedAgent._id}/salary-log`, logForm);
      // Push new log entry into selected agent
      const updatedLogs = [...selectedAgent.salaryLogs, data.log];
      const updatedAgent = { ...selectedAgent, salaryLogs: updatedLogs };
      setSelectedAgent(updatedAgent);
      setAgents(prev => prev.map(a => a._id === selectedAgent._id ? { ...a, salaryLogs: updatedLogs } : a));
      setShowLogForm(false);
      setLogForm({ month: selectedMonth, year: selectedYear, baseSalaryPaid: 0, incentivePaid: 0, note: '' });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add salary log');
    } finally {
      setSavingLog(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!selectedAgent) return;
    if (!window.confirm('Remove this salary log entry?')) return;
    try {
      await axios.delete(`/sales-agents/${selectedAgent._id}/salary-log/${logId}`);
      const updatedLogs = selectedAgent.salaryLogs.filter((l: any) => l._id !== logId);
      const updatedAgent = { ...selectedAgent, salaryLogs: updatedLogs };
      setSelectedAgent(updatedAgent);
      setAgents(prev => prev.map(a => a._id === selectedAgent._id ? { ...a, salaryLogs: updatedLogs } : a));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete log');
    }
  };

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!authUser || authUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const top3 = agents.slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Sales Team</h1>
          <p className="page-subtitle">Agent KPIs &amp; Profit Analysis</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Month Navigator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--bg-card)', border: '1px solid var(--navy-200)',
            borderRadius: 'var(--radius-md)', padding: '0.375rem 0.75rem',
            boxShadow: 'var(--shadow-xs)',
          }}>
            <button
              onClick={prevMonth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '2px 4px', borderRadius: 4, fontSize: '1rem', lineHeight: 1 }}
              title="Previous month"
            >‹</button>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy-800)', minWidth: 130, textAlign: 'center' }}>
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
            <button
              onClick={nextMonth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '2px 4px', borderRadius: 4, fontSize: '1rem', lineHeight: 1 }}
              title="Next month"
            >›</button>
          </div>

          <button className="btn btn-ghost btn-sm" onClick={() => { setWalletForm({ name: '', description: '' }); setEditWalletId(null); setShowWalletModal(true); }}>
            🏦 Wallets
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setConfigForm({ defaultThreshold: config.defaultThreshold, defaultRsPerUnit: config.defaultRsPerUnit }); fetchLiveRate(); setShowConfigModal(true); }}>
            ⚙ Settings
          </button>
          <button className="btn btn-primary btn-sm" onClick={openTagModal}>
            + Tag Agent
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
        <KpiCard label="Total Agents"        value={String(totalAgents)}    color="indigo" />
        <KpiCard label="Gross Revenue"        value={fmt$(sumRevUSD)}        color="green" />
        <KpiCard label="Total Salary Expense" value={fmtPKR(sumSalaryPKR)}  color="amber" />
        <KpiCard label="Total Incentive"      value={fmtPKR(sumIncentivePKR)} color="amber" />
        <KpiCard
          label="Net Profit"
          value={fmtPKR(sumNetProfitPKR)}
          color={sumNetProfitPKR >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* ── Leaderboard Row ───────────────────────────────────────────────── */}
      {top3.length > 0 && (
        <div>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Top Performers
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(top3.length, 3)}, 1fr)`, gap: '1rem' }}>
            {top3.map((agent, i) => {
              const mc = MEDAL_COLORS[i] || MEDAL_COLORS[2];
              const netProfit = agent.stats?.netProfitPKR || 0;
              return (
                <div key={agent._id} style={{
                  background: mc.bg,
                  border: `2px solid ${mc.border}`,
                  borderRadius: 'var(--radius-xl)',
                  padding: '1.25rem',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  boxShadow: `0 0 0 1px ${mc.border}22`,
                  cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
                  onClick={() => openAgentDetail(agent)}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{mc.medal}</span>
                    <div className="avatar avatar-md avatar-indigo" style={{ flexShrink: 0 }}>
                      {initials(agent.user.firstName, agent.user.lastName)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: mc.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.user.firstName} {agent.user.lastName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>Rank #{i + 1}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: mc.text, letterSpacing: '-0.02em' }}>
                    {fmtPKR(netProfit)}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--navy-600)' }}>
                    <span>Rev {fmt$(agent.stats?.totalRevenueUSD || 0)}</span>
                    <span>Incent {fmtPKR(agent.stats?.totalIncentivePKR || 0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Agents Table ──────────────────────────────────────────────────── */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-900)' }}>
            Agent Performance — {MONTHS[selectedMonth - 1]} {selectedYear}
          </span>
          <span className="badge badge-indigo">{agents.length} agents</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <h3>No sales agents tagged yet</h3>
            <p>Tag a reseller account as a sales agent to start tracking performance.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent</th>
                  <th>Clients</th>
                  <th>Deposits (USD)</th>
                  <th>Revenue (USD)</th>
                  <th>Gross Profit (&#8360;)</th>
                  <th>Incentive (&#8360;)</th>
                  <th>Salary (&#8360;)</th>
                  <th style={{ color: 'var(--navy-900)' }}>Net Profit (&#8360;)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, idx) => {
                  const s = agent.stats;
                  const isTop = idx === 0;
                  return (
                    <tr key={agent._id} style={isTop ? { background: '#FFFBEB' } : {}}>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: '50%',
                          background: isTop ? '#F59E0B' : 'var(--navy-100)',
                          color: isTop ? '#fff' : 'var(--navy-600)',
                          fontWeight: 700, fontSize: '0.8rem',
                        }}>
                          {agent.rank}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div className="avatar avatar-sm avatar-indigo">
                            {initials(agent.user.firstName, agent.user.lastName)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                              {agent.user.firstName} {agent.user.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>{agent.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-gray">{agent.user.clients?.length ?? 0}</span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{fmt$(s?.totalDepositsUSD || 0)}</td>
                      <td style={{ fontWeight: 500 }}>{fmt$(s?.totalRevenueUSD  || 0)}</td>
                      <td style={{ fontWeight: 500 }}>{fmtPKR(s?.grossProfitPKR   || 0)}</td>
                      <td style={{ fontWeight: 500, color: 'var(--warning-600)' }}>{fmtPKR(s?.totalIncentivePKR || 0)}</td>
                      <td style={{ fontWeight: 500 }}>{fmtPKR(s?.baseSalaryPKR    || 0)}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: (s?.netProfitPKR || 0) >= 0 ? 'var(--success-600)' : 'var(--danger-600)',
                        }}>
                          {fmtPKR(s?.netProfitPKR || 0)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openAgentDetail(agent)}>
                            View Details
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'var(--danger-50)', color: 'var(--danger-600)', border: '1px solid var(--danger-100)' }}
                            onClick={() => handleSoftDelete(agent._id)}
                            title="Deactivate"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Agent Detail Modal ────────────────────────────────────────────── */}
      {selectedAgent && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedAgent(null); }}>
          <div
            className="modal-box"
            style={{ maxWidth: 860, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '0' }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem 2rem',
              borderBottom: '1px solid var(--navy-100)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, background: '#fff', zIndex: 5,
              borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <div className="avatar avatar-md avatar-indigo">
                  {initials(selectedAgent.user.firstName, selectedAgent.user.lastName)}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                    {selectedAgent.user.firstName} {selectedAgent.user.lastName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>
                    {selectedAgent.user.email}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveTab('formula')}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Edit Formula
                </button>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.25rem', padding: '0.25rem' }}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--navy-100)',
              padding: '0 2rem',
              background: 'var(--navy-50)',
            }}>
              {(['overview', 'clients', 'salary', 'formula'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.875rem 1rem',
                    fontSize: '0.85rem', fontWeight: 600,
                    color: activeTab === tab ? 'var(--accent-600)' : 'var(--navy-500)',
                    borderBottom: activeTab === tab ? '2px solid var(--accent-600)' : '2px solid transparent',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize',
                    marginBottom: '-1px',
                  }}
                >
                  {tab === 'salary' ? 'Salary Log' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ padding: '1.5rem 2rem' }}>

              {/* Overview Tab */}
              {activeTab === 'overview' && (() => {
                const s = selectedAgent.stats;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.875rem' }}>
                      <MiniKpi label="Deposits" value={fmt$(s?.totalDepositsUSD || 0)} />
                      <MiniKpi label="Revenue" value={fmt$(s?.totalRevenueUSD || 0)} />
                      <MiniKpi label="Gross Profit" value={fmtPKR(s?.grossProfitPKR || 0)} />
                      <MiniKpi label="Incentive" value={fmtPKR(s?.totalIncentivePKR || 0)} color="var(--warning-600)" />
                      <MiniKpi label="Base Salary" value={fmtPKR(s?.baseSalaryPKR || 0)} />
                      <MiniKpi
                        label="Net Profit"
                        value={fmtPKR(s?.netProfitPKR || 0)}
                        color={(s?.netProfitPKR || 0) >= 0 ? 'var(--success-600)' : 'var(--danger-600)'}
                      />
                    </div>

                    {/* Formula Preview */}
                    <div style={{
                      background: 'var(--accent-50)', border: '1px solid var(--accent-200)',
                      borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-700)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                        Incentive Formula
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--navy-700)', lineHeight: 1.6 }}>
                        {selectedAgent.stats?.clients?.slice(0, 1).map((c) => {
                          const rate      = c.clientRate;
                          const threshold = selectedAgent.incentiveThreshold;
                          const rsPerUnit = selectedAgent.incentiveRsPerUnit;
                          if (rate <= threshold) {
                            return (
                              <span key={c.clientId}>
                                Rate <strong>${rate.toFixed(2)}</strong> ≤ Threshold <strong>${threshold.toFixed(2)}</strong> → No incentive qualifies
                              </span>
                            );
                          }
                          const units = ((rate - threshold) / 0.01).toFixed(1);
                          return (
                            <span key={c.clientId}>
                              Rate <strong>${rate.toFixed(2)}</strong> &gt; Threshold <strong>${threshold.toFixed(2)}</strong>
                              {' '}→ <strong>{units}</strong> units × <strong>&#8360;{rsPerUnit.toFixed(2)}</strong> = <strong>&#8360;{(parseFloat(units) * rsPerUnit).toFixed(2)}</strong> per label
                            </span>
                          );
                        }) ?? (
                          <span>
                            Threshold: <strong>${selectedAgent.incentiveThreshold.toFixed(2)}</strong> · &#8360;{selectedAgent.incentiveRsPerUnit.toFixed(2)} per $0.01 above threshold
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Clients Tab */}
              {activeTab === 'clients' && (
                <div style={{ overflowX: 'auto' }}>
                  {(!selectedAgent.stats?.clients || selectedAgent.stats.clients.length === 0) ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                      <h3>No clients</h3>
                      <p>This agent has no clients assigned yet.</p>
                    </div>
                  ) : (
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Rate (USD)</th>
                          <th>Deposits (USD)</th>
                          <th>Labels</th>
                          <th>Revenue (USD)</th>
                          <th>Incentive (&#8360;)</th>
                          <th>Qualifies</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAgent.stats.clients.map((c) => (
                          <tr key={c.clientId}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>{c.email}</div>
                            </td>
                            <td>${c.clientRate.toFixed(3)}</td>
                            <td>{fmt$(c.clientPaidUSD)}</td>
                            <td>{Math.round(c.clientLabelCount).toLocaleString()}</td>
                            <td>{fmt$(c.clientRevUSD)}</td>
                            <td style={{ color: 'var(--warning-600)', fontWeight: 600 }}>{fmtPKR(c.incentivePKR)}</td>
                            <td>
                              {c.clientRate > selectedAgent.incentiveThreshold ? (
                                <span className="badge badge-green">Yes</span>
                              ) : (
                                <span className="badge badge-gray">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Salary Log Tab */}
              {activeTab === 'salary' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowLogForm(f => !f)}>
                      {showLogForm ? 'Cancel' : '+ Log Payment'}
                    </button>
                  </div>

                  {/* Inline Log Form */}
                  {showLogForm && (
                    <div style={{
                      background: 'var(--navy-50)', border: '1px solid var(--navy-200)',
                      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem',
                    }}>
                      <div>
                        <label className="form-label">Month</label>
                        <select className="form-input form-select" value={logForm.month} onChange={e => setLogForm(f => ({ ...f, month: parseInt(e.target.value) }))}>
                          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Year</label>
                        <input className="form-input" type="number" value={logForm.year} onChange={e => setLogForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
                      </div>
                      <div>
                        <label className="form-label">Base Salary Paid (&#8360;)</label>
                        <input className="form-input" type="number" min={0} step={100} value={logForm.baseSalaryPaid} onChange={e => setLogForm(f => ({ ...f, baseSalaryPaid: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="form-label">Incentive Paid (&#8360;)</label>
                        <input className="form-input" type="number" min={0} step={100} value={logForm.incentivePaid} onChange={e => setLogForm(f => ({ ...f, incentivePaid: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="form-label">Note</label>
                        <input className="form-input" type="text" placeholder="Optional note" value={logForm.note} onChange={e => setLogForm(f => ({ ...f, note: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAddLog} disabled={savingLog} style={{ width: '100%' }}>
                          {savingLog ? 'Saving…' : 'Save Log'}
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedAgent.salaryLogs.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                      <h3>No salary logs</h3>
                      <p>Click "+ Log Payment" to record a payment.</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Year</th>
                            <th>Base Salary</th>
                            <th>Incentive Paid</th>
                            <th>Total</th>
                            <th>Note</th>
                            <th>Date</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...selectedAgent.salaryLogs].reverse().map((log: any) => (
                            <tr key={log._id}>
                              <td>{MONTHS[(log.month || 1) - 1]}</td>
                              <td>{log.year}</td>
                              <td>{fmtPKR(log.baseSalaryPaid || 0)}</td>
                              <td style={{ color: 'var(--warning-600)' }}>{fmtPKR(log.incentivePaid || 0)}</td>
                              <td style={{ fontWeight: 700 }}>{fmtPKR(log.totalPaid || 0)}</td>
                              <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{log.note || '—'}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--navy-500)' }}>
                                {log.paidAt ? new Date(log.paidAt).toLocaleDateString() : '—'}
                              </td>
                              <td>
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', fontSize: '0.85rem' }}
                                  onClick={() => handleDeleteLog(log._id)}
                                  title="Remove log"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Formula Tab */}
              {activeTab === 'formula' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* Base formula fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label className="form-label">Default Threshold (USD)</label>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={formulaForm.incentiveThreshold}
                        onChange={e => setFormulaForm(f => ({ ...f, incentiveThreshold: parseFloat(e.target.value) || 0 }))}
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: '0.25rem' }}>
                        Fallback when no vendor override matches
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Default &#8360; per $0.01 unit</label>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step={0.1}
                        value={formulaForm.incentiveRsPerUnit}
                        onChange={e => setFormulaForm(f => ({ ...f, incentiveRsPerUnit: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>

                    <div>
                      <label className="form-label">Base Monthly Salary (&#8360;)</label>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step={500}
                        value={formulaForm.baseSalaryPKR}
                        onChange={e => setFormulaForm(f => ({ ...f, baseSalaryPKR: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">Notes</label>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={formulaForm.notes}
                        onChange={e => setFormulaForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Internal notes about this agent's compensation"
                      />
                    </div>
                  </div>

                  {/* Per-vendor overrides */}
                  <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Per-Vendor Formula Overrides</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: '0.125rem' }}>
                          Different threshold / rate for specific carrier-vendor combinations
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={handleAddVendorFormulaRow}>+ Add Override</button>
                    </div>

                    {vendorFormulaRows.length === 0 ? (
                      <div style={{
                        fontSize: '0.8rem', color: 'var(--navy-400)', fontStyle: 'italic',
                        padding: '0.875rem 1rem', background: 'var(--navy-50)',
                        borderRadius: 'var(--radius-md)', border: '1px dashed var(--navy-200)',
                      }}>
                        No overrides — all vendors use the default formula above.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="sh-table" style={{ fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th>Carrier</th>
                              <th>Vendor Name</th>
                              <th>Threshold (USD)</th>
                              <th>&#8360; / $0.01</th>
                              <th>Active</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendorFormulaRows.map((row, i) => (
                              <tr key={i}>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <select
                                    className="form-input form-select"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', minWidth: 80 }}
                                    value={row.carrier}
                                    onChange={e => updateVendorFormulaRow(i, 'carrier', e.target.value)}
                                  >
                                    {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <input
                                    className="form-input"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', minWidth: 180 }}
                                    value={row.vendorName}
                                    onChange={e => updateVendorFormulaRow(i, 'vendorName', e.target.value)}
                                    placeholder="e.g. USPS Ground – EasyPost"
                                  />
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <input
                                    className="form-input"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 80 }}
                                    value={row.incentiveThreshold}
                                    onChange={e => updateVendorFormulaRow(i, 'incentiveThreshold', parseFloat(e.target.value) || 0)}
                                  />
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <input
                                    className="form-input"
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 70 }}
                                    value={row.incentiveRsPerUnit}
                                    onChange={e => updateVendorFormulaRow(i, 'incentiveRsPerUnit', parseFloat(e.target.value) || 0)}
                                  />
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={row.isActive}
                                    onChange={e => updateVendorFormulaRow(i, 'isActive', e.target.checked)}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ padding: '0.375rem 0.5rem' }}>
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', fontSize: '1rem', padding: '2px 4px' }}
                                    onClick={() => removeVendorFormulaRow(i)}
                                    title="Remove"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Live Formula Preview */}
                  <div style={{
                    background: 'var(--accent-50)', border: '1px solid var(--accent-200)',
                    borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
                  }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-700)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Formula Preview (default, rate = $0.80)
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--navy-700)', lineHeight: 1.7 }}>
                      <div>Base Salary: <strong>{fmtPKR(formulaForm.baseSalaryPKR)}</strong> / month</div>
                      <div>
                        If client rate = <strong>$0.80</strong> &gt; threshold <strong>${formulaForm.incentiveThreshold.toFixed(2)}</strong>:
                        {' '}
                        {0.80 > formulaForm.incentiveThreshold
                          ? <>→ {((0.80 - formulaForm.incentiveThreshold) / 0.01).toFixed(1)} units × &#8360;{formulaForm.incentiveRsPerUnit.toFixed(2)} = <strong>&#8360;{(((0.80 - formulaForm.incentiveThreshold) / 0.01) * formulaForm.incentiveRsPerUnit).toFixed(2)}</strong> per label</>
                          : <span style={{ color: 'var(--danger-500)' }}>No incentive (rate ≤ threshold)</span>
                        }
                      </div>
                      {vendorFormulaRows.length > 0 && (
                        <div style={{ marginTop: '0.375rem', fontSize: '0.78rem', color: 'var(--navy-500)' }}>
                          + {vendorFormulaRows.filter(r => r.isActive).length} active vendor override{vendorFormulaRows.filter(r => r.isActive).length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <button className="btn btn-primary" onClick={handleSaveFormula} disabled={savingFormula}>
                    {savingFormula ? 'Saving…' : 'Save Formula & Overrides'}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Management Modal ──────────────────────────────────────── */}
      {showWalletModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowWalletModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Manage Wallets</h2>
              <button onClick={() => setShowWalletModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* Add / Edit form */}
            <div style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: '0.625rem' }}>
                {editWalletId ? 'Edit Wallet' : 'Add New Wallet'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label className="form-label">Name *</label>
                  <input
                    type="text" className="form-input"
                    value={walletForm.name}
                    onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Wise, Aura Nest, TWS"
                  />
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input
                    type="text" className="form-input"
                    value={walletForm.description}
                    onChange={e => setWalletForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Optional note"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {editWalletId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditWalletId(null); setWalletForm({ name: '', description: '' }); }}>
                    Cancel
                  </button>
                )}
                <button className="btn btn-primary btn-sm" disabled={savingWallet || !walletForm.name.trim()} onClick={handleSaveWallet}>
                  {savingWallet ? 'Saving…' : editWalletId ? 'Update' : '+ Add Wallet'}
                </button>
              </div>
            </div>

            {/* Wallet list */}
            {wallets.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>No wallets configured yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {wallets.map(w => (
                  <div key={w._id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: w.isActive ? '#fff' : 'var(--navy-25)',
                    border: '1px solid var(--navy-100)', borderRadius: 8, padding: '0.5rem 0.75rem',
                    opacity: w.isActive ? 1 : 0.6,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy-800)' }}>{w.name}</div>
                      {w.description && <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{w.description}</div>}
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: w.isActive ? '#dcfce7' : 'var(--navy-100)', color: w.isActive ? '#15803d' : 'var(--navy-500)' }}>
                      {w.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditWalletId(w._id); setWalletForm({ name: w.name, description: w.description }); }}>
                      ✎
                    </button>
                    <button className="btn btn-ghost btn-sm" title={w.isActive ? 'Deactivate' : 'Activate'} onClick={() => handleToggleWallet(w._id, w.isActive)}>
                      {w.isActive ? '⏸' : '▶'}
                    </button>
                    <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: '#dc2626' }} onClick={() => handleDeleteWallet(w._id)}>
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tag Agent Modal ───────────────────────────────────────────────── */}
      {showTagModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTagModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Tag as Sales Agent</h2>
              <button onClick={() => setShowTagModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Select Reseller</label>
                <select
                  className="form-input form-select"
                  value={tagForm.userId}
                  onChange={e => setTagForm(f => ({ ...f, userId: e.target.value }))}
                >
                  <option value="">— Choose a reseller —</option>
                  {allResellers.map((r: any) => (
                    <option key={r._id ?? r.id} value={r._id ?? r.id}>
                      {r.firstName} {r.lastName} ({r.email})
                    </option>
                  ))}
                </select>
                {allResellers.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: '0.25rem' }}>
                    All resellers are already tagged as agents.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="form-label">Base Salary (&#8360;)</label>
                  <input className="form-input" type="number" min={0} step={500} value={tagForm.baseSalaryPKR}
                    onChange={e => setTagForm(f => ({ ...f, baseSalaryPKR: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="form-label">Threshold (USD)</label>
                  <input className="form-input" type="number" min={0} step={0.01} value={tagForm.incentiveThreshold}
                    onChange={e => setTagForm(f => ({ ...f, incentiveThreshold: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="form-label">&#8360; per $0.01 unit</label>
                  <input className="form-input" type="number" min={0} step={0.1} value={tagForm.incentiveRsPerUnit}
                    onChange={e => setTagForm(f => ({ ...f, incentiveRsPerUnit: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} placeholder="Optional notes" value={tagForm.notes}
                  onChange={e => setTagForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setShowTagModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleTagAgent} disabled={savingTag || !tagForm.userId}>
                  {savingTag ? 'Tagging…' : 'Tag as Sales Agent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Settings Modal ─────────────────────────────────────────── */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowConfigModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Global Sales Settings</h2>
              <button onClick={() => setShowConfigModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Live exchange rate display */}
              <div>
                <label className="form-label">USD to PKR Exchange Rate</label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.625rem',
                  padding: '0.625rem 0.875rem',
                  background: 'var(--navy-50)', border: '1px solid var(--navy-200)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  {loadingRate ? (
                    <span style={{ fontSize: '0.875rem', color: 'var(--navy-400)' }}>Fetching…</span>
                  ) : liveRate ? (
                    <>
                      <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                        &#8360;{liveRate.rate.toFixed(2)}
                      </span>
                      <span className={`badge badge-${liveRate.source === 'live' ? 'green' : liveRate.source === 'cache' ? 'indigo' : 'amber'}`}>
                        {liveRate.source === 'live' ? 'Live' : liveRate.source === 'cache' ? 'Cached' : liveRate.source === 'stale' ? 'Stale' : 'Fallback'}
                      </span>
                      {liveRate.fetchedAt && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--navy-400)', marginLeft: 2 }}>
                          {new Date(liveRate.fetchedAt).toLocaleTimeString()}
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={fetchLiveRate}
                        disabled={loadingRate}
                        style={{ marginLeft: 'auto', padding: '0.125rem 0.5rem', fontSize: '0.85rem' }}
                        title="Refresh rate"
                      >
                        ↻
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.875rem', color: 'var(--danger-500)' }}>Unavailable</span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', marginTop: '0.25rem' }}>
                  Auto-fetched via Open Exchange Rates API (1 h cache)
                </div>
              </div>

              <div>
                <label className="form-label">Default Incentive Threshold (USD)</label>
                <input className="form-input" type="number" min={0} step={0.01} value={configForm.defaultThreshold}
                  onChange={e => setConfigForm(f => ({ ...f, defaultThreshold: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="form-label">Default &#8360; per $0.01 unit</label>
                <input className="form-input" type="number" min={0} step={0.1} value={configForm.defaultRsPerUnit}
                  onChange={e => setConfigForm(f => ({ ...f, defaultRsPerUnit: parseFloat(e.target.value) || 0 }))} />
              </div>

              <div style={{
                background: 'var(--warning-50)', border: '1px solid var(--warning-100)',
                borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
                fontSize: '0.8rem', color: 'var(--warning-600)',
              }}>
                Defaults apply to new agents. Existing agent formulas are unaffected.
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button className="btn btn-ghost" onClick={() => setShowConfigModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig}>
                  {savingConfig ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface KpiCardProps { label: string; value: string; color?: 'green' | 'indigo' | 'amber' | 'red'; }

const KpiCard: React.FC<KpiCardProps> = ({ label, value, color = 'indigo' }) => (
  <div className={`metric-card ${color}`}>
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em' }}>
      {value}
    </div>
  </div>
);

interface MiniKpiProps { label: string; value: string; color?: string; }

const MiniKpi: React.FC<MiniKpiProps> = ({ label, value, color }) => (
  <div style={{
    background: 'var(--navy-50)', borderRadius: 'var(--radius-lg)',
    padding: '0.875rem 1rem', border: '1px solid var(--navy-100)',
  }}>
    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: color || 'var(--navy-900)' }}>
      {value}
    </div>
  </div>
);

export default SalesAgents;
