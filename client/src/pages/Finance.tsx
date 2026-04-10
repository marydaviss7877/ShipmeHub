import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FinanceRow {
  clientId:    string;
  clientName:  string;
  clientEmail: string;
  carrier:     string;
  labelCount:  number;
  totalAmount: number;
  collected:   number;
  difference:  number;
  usdCost:     number | null;
  status:      string;
  note:        string;
  statusId:    string | null;
  source?:     string;
}

interface Summary {
  totalLabels:  number;
  totalAmount:  number;
  collected:    number;
  difference:   number;
  totalUsdCost?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

const STATUS_OPTIONS = ['Clear', 'Pending', 'Outstanding', 'Blocked'];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Clear:       { bg: '#DCFCE7', color: '#15803D' },
  Pending:     { bg: '#FEF9C3', color: '#854D0E' },
  Outstanding: { bg: '#FFEDD5', color: '#C2410C' },
  Blocked:     { bg: '#FEE2E2', color: '#B91C1C' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CarrierBadge: React.FC<{ carrier: string }> = ({ carrier }) => {
  const styles: Record<string, React.CSSProperties> = {
    USPS:  { background: '#004B87', color: '#fff' },
    UPS:   { background: '#4B1400', color: '#FFB500' },
    DHL:   { background: '#FFCC00', color: '#D40511' },
  };
  if (carrier === 'FedEx') return (
    <span style={{ fontWeight: 900, fontSize: '0.82rem' }}>
      <span style={{ color: '#4D148C' }}>Fed</span><span style={{ color: '#FF6600' }}>Ex</span>
    </span>
  );
  return (
    <span style={{
      fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: 4,
      ...(styles[carrier] || { background: '#334155', color: '#fff' }),
    }}>{carrier}</span>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const Finance: React.FC = () => {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';

  // ── Date state
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

  // ── Data state
  const [rows,    setRows]    = useState<FinanceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Filters
  const [searchTerm,    setSearchTerm]    = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');

  // ── Inline status editing
  const [editingRow, setEditingRow] = useState<string | null>(null); // `clientId_carrier`
  const [editStatus, setEditStatus] = useState('');
  const [editNote,   setEditNote]   = useState('');
  const [savingRow,  setSavingRow]  = useState(false);

  // ── CSV export
  const [exporting, setExporting] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/finance' : '/finance/my-clients';
      const { data } = await axios.get(endpoint, {
        params: { month: selectedMonth, year: selectedYear },
      });
      setRows(data.rows || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to load finance data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Month navigation ───────────────────────────────────────────────────────

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ── Status edit actions ────────────────────────────────────────────────────

  const startEdit = (row: FinanceRow) => {
    setEditingRow(`${row.clientId}_${row.carrier}`);
    setEditStatus(row.status);
    setEditNote(row.note);
  };

  const cancelEdit = () => { setEditingRow(null); };

  const saveRowStatus = async (row: FinanceRow) => {
    setSavingRow(true);
    try {
      await axios.patch('/finance/row-status', {
        clientId: row.clientId,
        carrier:  row.carrier,
        month:    selectedMonth,
        year:     selectedYear,
        status:   editStatus,
        note:     editNote,
      });
      setRows(prev => prev.map(r =>
        r.clientId === row.clientId && r.carrier === row.carrier
          ? { ...r, status: editStatus, note: editNote }
          : r
      ));
      setEditingRow(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save');
    } finally {
      setSavingRow(false);
    }
  };

  // ── CSV export ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/finance/export', {
        params:       { month: selectedMonth, year: selectedYear },
        responseType: 'blob',
      });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `finance_${MONTHS[selectedMonth - 1]}_${selectedYear}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const filteredRows = rows.filter(r => {
    if (carrierFilter && r.carrier !== carrierFilter) return false;
    if (statusFilter  && r.status  !== statusFilter)  return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!r.clientEmail.toLowerCase().includes(q) &&
          !r.clientName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'reseller')) {
    return <Navigate to="/dashboard" replace />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-subtitle">Monthly reconciliation — labels vs payments</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Month navigator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--bg-card)', border: '1px solid var(--navy-200)',
            borderRadius: 'var(--radius-md)', padding: '0.375rem 0.75rem',
            boxShadow: 'var(--shadow-xs)',
          }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '2px 4px', fontSize: '1rem' }}>‹</button>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy-800)', minWidth: 140, textAlign: 'center' }}>
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', padding: '2px 4px', fontSize: '1rem' }}>›</button>
          </div>

          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Summary Cards ─────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <KpiCard label="Total Labels"  value={summary.totalLabels.toLocaleString()} color="indigo" />
          <KpiCard label="Total Revenue" value={`$${summary.totalAmount.toFixed(2)}`} color="indigo" />
          <KpiCard label="Collected"     value={`$${summary.collected.toFixed(2)}`}   color="green" />
          <KpiCard
            label="Outstanding"
            value={`$${Math.abs(summary.difference).toFixed(2)}`}
            color={summary.difference > 0.01 ? 'amber' : 'green'}
          />
          {isAdmin && summary.totalUsdCost !== undefined && (
            <KpiCard label="USPS Cost" value={`$${summary.totalUsdCost.toFixed(2)}`} color="indigo" />
          )}
        </div>
      )}

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ maxWidth: 240, padding: '0.5rem 0.875rem' }}
          placeholder="Search client…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <select
          className="form-input form-select"
          style={{ maxWidth: 160 }}
          value={carrierFilter}
          onChange={e => setCarrierFilter(e.target.value)}
        >
          <option value="">All Carriers</option>
          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="form-input form-select"
          style={{ maxWidth: 160 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginLeft: 'auto' }}>
          {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Main Table ────────────────────────────────────────────────────── */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy-900)' }}>
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </span>
          <span className="badge badge-indigo">{filteredRows.length} entries</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 14l-4-4 4-4M15 10h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3>No data for this period</h3>
            <p>No labels were generated in {MONTHS[selectedMonth - 1]} {selectedYear}.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sh-table">
              <thead>
                <tr>
                  {isAdmin && <th>Source</th>}
                  <th>Client</th>
                  <th>Carrier</th>
                  <th style={{ textAlign: 'right' }}>Labels</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total ($)</th>
                  <th style={{ textAlign: 'right' }}>Collected ($)</th>
                  <th style={{ textAlign: 'right' }}>Diff ($)</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>USPS Cost</th>}
                  <th>Note</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const rowKey    = `${row.clientId}_${row.carrier}`;
                  const isEditing = editingRow === rowKey;
                  const sstyle    = STATUS_STYLE[row.status] || STATUS_STYLE['Pending'];
                  const hasDebt   = row.difference > 0.01;

                  return (
                    <tr key={rowKey} style={hasDebt && row.difference > 50 ? { background: '#FFFBEB' } : {}}>
                      {isAdmin && (
                        <td>
                          {row.source ? (
                            <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{row.source}</span>
                          ) : (
                            <span style={{ color: 'var(--navy-300)', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      )}
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.clientName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)' }}>{row.clientEmail}</div>
                      </td>
                      <td><CarrierBadge carrier={row.carrier} /></td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.labelCount.toLocaleString()}</td>
                      <td>
                        {isEditing ? (
                          <select
                            className="form-input form-select"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', minWidth: 110 }}
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value)}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px', borderRadius: 4,
                            fontSize: '0.75rem', fontWeight: 600,
                            background: sstyle.bg, color: sstyle.color,
                          }}>
                            {row.status}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>${row.totalAmount.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--success-600)' }}>${row.collected.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: hasDebt ? 'var(--danger-600)' : 'var(--success-600)' }}>
                        {hasDebt
                          ? `-$${row.difference.toFixed(2)}`
                          : `+$${Math.abs(row.difference).toFixed(2)}`}
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right', color: 'var(--navy-500)', fontSize: '0.85rem' }}>
                          {row.usdCost != null
                            ? `$${row.usdCost.toFixed(2)}`
                            : <span style={{ color: 'var(--navy-300)' }}>—</span>}
                        </td>
                      )}
                      <td>
                        {isEditing ? (
                          <input
                            className="form-input"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', minWidth: 140 }}
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            placeholder="Note…"
                          />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--navy-500)' }}>
                            {row.note || <span style={{ color: 'var(--navy-300)' }}>—</span>}
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => saveRowStatus(row)}
                                disabled={savingRow}
                                style={{ padding: '0.25rem 0.625rem', fontSize: '0.78rem' }}
                              >
                                {savingRow ? '…' : 'Save'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={cancelEdit}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => startEdit(row)}
                              style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface KpiCardProps { label: string; value: string; color?: 'green' | 'indigo' | 'amber' | 'red'; }
const KpiCard: React.FC<KpiCardProps> = ({ label, value, color = 'indigo' }) => (
  <div className={`metric-card ${color}`}>
    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{label}</div>
    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em' }}>{value}</div>
  </div>
);

export default Finance;
