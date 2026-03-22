import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  PlusIcon, PencilIcon, TrashIcon, XMarkIcon,
  AdjustmentsHorizontalIcon, TagIcon,
  ArrowDownTrayIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpenseCategory {
  _id: string; name: string; type: string; isActive: boolean;
}
interface Wallet {
  _id: string; name: string; isActive: boolean;
}
interface CashBookEntry {
  _id: string;
  entryType: 'debit' | 'credit';
  amountPKR: number;
  amountUSD?: number;
  wallet?: { _id: string; name: string } | null;
  category?: { _id: string; name: string; type: string } | null;
  description: string;
  clientName?: string | null;
  date: string;
  enteredBy?: { firstName: string; lastName: string };
  isAutoEntry?: boolean;
  source?: 'payment_log' | string;
  screenshots?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Screenshots are stored as "/api/payment-logs/screenshot/filename.jpg".
// <img src> always requests from the React dev-server (port 3000), not the API
// server (port 5001), so we must prefix with the full server origin.
const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5001/api')
  .replace(/\/api\/?$/, '');   // → "http://localhost:5001"

const toAbsoluteUrl = (path: string) =>
  path.startsWith('http') ? path : `${API_BASE}${path}`;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const fmtPKR = (n: number) =>
  `₨${Math.round(n).toLocaleString('en-PK')}`;

const CAT_TYPE_COLORS: Record<string, string> = {
  expense: '#dc2626',
  advertising: '#ea580c',
  salary: '#7c3aed',
  distribution: '#0891b2',
  transfer: '#0284c7',
  other: '#64748b',
};

// ── Main Component ────────────────────────────────────────────────────────────

const CashBook: React.FC = () => {
  const { user: authUser } = useAuth();

  // ── Period ────────────────────────────────────────────────────────────────
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());

  // ── Data ──────────────────────────────────────────────────────────────────
  const [entries,    setEntries]    = useState<CashBookEntry[]>([]);
  const [summary,    setSummary]    = useState({ totalCredits: 0, totalDebits: 0, netFlow: 0 });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [wallets,    setWallets]    = useState<Wallet[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterType,     setFilterType]     = useState('');
  const [filterWallet,   setFilterWallet]   = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // ── Entry Modal ───────────────────────────────────────────────────────────
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editEntry,      setEditEntry]      = useState<CashBookEntry | null>(null);
  const [entryForm,      setEntryForm]      = useState({
    entryType: 'debit' as 'debit' | 'credit',
    amountPKR: '',
    walletId: '',
    categoryId: '',
    description: '',
    date: now.toISOString().slice(0, 10),
  });
  const [savingEntry, setSavingEntry] = useState(false);

  // ── Category Modal ────────────────────────────────────────────────────────
  const [showCatModal,  setShowCatModal]  = useState(false);
  const [catForm,       setCatForm]       = useState({ name: '', type: 'expense' });
  const [editCatId,     setEditCatId]     = useState<string | null>(null);
  const [savingCat,     setSavingCat]     = useState(false);

  // ── Screenshot lightbox ───────────────────────────────────────────────────
  const [lightboxUrls,  setLightboxUrls]  = useState<string[]>([]);
  const [lightboxIdx,   setLightboxIdx]   = useState(0);

  const openLightbox = (urls: string[], startIdx = 0) => {
    setLightboxUrls(urls);
    setLightboxIdx(startIdx);
  };
  const closeLightbox = () => setLightboxUrls([]);

  const downloadFile = async (url: string) => {
    const absUrl = toAbsoluteUrl(url);
    const filename = absUrl.split('/').pop() || 'screenshot';
    try {
      const res = await fetch(absUrl);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch {
      window.open(absUrl, '_blank');
    }
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { month: selectedMonth, year: selectedYear };
      if (filterType)     params.entryType = filterType;
      if (filterWallet)   params.wallet    = filterWallet;
      if (filterCategory) params.category  = filterCategory;
      const { data } = await axios.get('/cashbook', { params });
      setEntries(data.entries || []);
      setSummary(data.summary || { totalCredits: 0, totalDebits: 0, netFlow: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, filterType, filterWallet, filterCategory]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await axios.get('/expense-categories');
      setCategories(data.categories || []);
    } catch {}
  }, []);

  const fetchWallets = useCallback(async () => {
    try {
      const { data } = await axios.get('/wallets');
      setWallets(data.wallets || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEntries(); },   [fetchEntries]);
  useEffect(() => { fetchCategories(); fetchWallets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month nav ─────────────────────────────────────────────────────────────

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  // ── Entry CRUD ────────────────────────────────────────────────────────────

  const openEntryModal = (entry?: CashBookEntry) => {
    if (entry) {
      setEditEntry(entry);
      setEntryForm({
        entryType:   entry.entryType,
        amountPKR:   String(entry.amountPKR),
        walletId:    entry.wallet?._id ?? '',
        categoryId:  entry.category?._id ?? '',
        description: entry.description,
        date:        entry.date.slice(0, 10),
      });
    } else {
      setEditEntry(null);
      setEntryForm({
        entryType: 'debit',
        amountPKR: '',
        walletId: '',
        categoryId: '',
        description: '',
        date: new Date().toISOString().slice(0, 10),
      });
    }
    setShowEntryModal(true);
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryForm.amountPKR) return;
    setSavingEntry(true);
    try {
      const payload = {
        entryType:   entryForm.entryType,
        amountPKR:   parseFloat(entryForm.amountPKR),
        walletId:    entryForm.walletId || null,
        categoryId:  entryForm.categoryId || null,
        description: entryForm.description,
        date:        entryForm.date,
      };
      if (editEntry) {
        await axios.put(`/cashbook/${editEntry._id}`, payload);
      } else {
        await axios.post('/cashbook', payload);
      }
      setShowEntryModal(false);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save entry');
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await axios.delete(`/cashbook/${id}`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Cannot delete this entry');
    }
  };

  // ── Category CRUD ─────────────────────────────────────────────────────────

  const submitCategory = async () => {
    if (!catForm.name.trim()) return;
    setSavingCat(true);
    try {
      if (editCatId) {
        await axios.put(`/expense-categories/${editCatId}`, catForm);
      } else {
        await axios.post('/expense-categories', catForm);
      }
      setCatForm({ name: '', type: 'expense' });
      setEditCatId(null);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSavingCat(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await axios.delete(`/expense-categories/${id}`);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete category');
    }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!authUser || authUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  // ── Render ────────────────────────────────────────────────────────────────

  const netIsPositive = summary.netFlow >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Cash Book</h1>
          <p className="page-subtitle">Master ledger — all debits, credits and wallet flows</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Month Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--navy-200)', borderRadius: 'var(--radius-md)', padding: '0.375rem 0.75rem', boxShadow: 'var(--shadow-xs)' }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', fontSize: '1rem', padding: '2px 4px', borderRadius: 4 }}>‹</button>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy-800)', minWidth: 130, textAlign: 'center' }}>
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-500)', fontSize: '1rem', padding: '2px 4px', borderRadius: 4 }}>›</button>
          </div>

          <button className="btn btn-ghost btn-sm" onClick={() => { setCatForm({ name: '', type: 'expense' }); setEditCatId(null); setShowCatModal(true); }}>
            <TagIcon style={{ width: 14, height: 14 }} /> Categories
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => openEntryModal()}>
            <PlusIcon style={{ width: 14, height: 14 }} /> Add Entry
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {/* Credits */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '1.5rem 1.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(21,128,61,0.08)',
          border: '1px solid #dcfce7', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #16a34a, #4ade80)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Total In</span>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#16a34a,#4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#15803d', lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtPKR(summary.totalCredits)}</div>
          <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '0.375rem', fontWeight: 500 }}>credits received</div>
        </div>

        {/* Debits */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '1.5rem 1.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(220,38,38,0.08)',
          border: '1px solid #fee2e2', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #dc2626, #f87171)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Total Out</span>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#dc2626,#f87171)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#dc2626', lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtPKR(summary.totalDebits)}</div>
          <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.375rem', fontWeight: 500 }}>debits recorded</div>
        </div>

        {/* Net Flow */}
        <div style={{
          background: netIsPositive
            ? 'linear-gradient(135deg, #052e16 0%, #14532d 100%)'
            : 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)',
          borderRadius: 16, padding: '1.5rem 1.75rem',
          boxShadow: netIsPositive
            ? '0 4px 24px rgba(21,128,61,0.35)'
            : '0 4px 24px rgba(220,38,38,0.35)',
          border: 'none', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Net Flow</span>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><polyline points="7 17 12 22 17 17"/></svg>
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
            {netIsPositive ? '+' : '−'}{fmtPKR(Math.abs(summary.netFlow))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.375rem', fontWeight: 500 }}>
            {netIsPositive ? 'surplus this period' : 'deficit this period'}
          </div>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="sh-card" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <AdjustmentsHorizontalIcon style={{ width: 16, height: 16, color: 'var(--navy-400)' }} />
        <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.3rem 0.6rem' }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="credit">Credits</option>
          <option value="debit">Debits</option>
        </select>
        <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.3rem 0.6rem' }}
          value={filterWallet} onChange={e => setFilterWallet(e.target.value)}>
          <option value="">All Wallets</option>
          {wallets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
        </select>
        <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.3rem 0.6rem' }}
          value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        {(filterType || filterWallet || filterCategory) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType(''); setFilterWallet(''); setFilterCategory(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Transactions Table ─────────────────────────────────────────────── */}
      <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--navy-400)' }}>
            No entries for this period.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy-25)', borderBottom: '1px solid var(--navy-100)' }}>
                  {['Date', 'Type', 'Amount', 'Wallet', 'Category', 'Description', 'By', ''].map(h => (
                    <th key={h} style={{ padding: '0.625rem 0.875rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isCredit = e.entryType === 'credit';
                  return (
                    <tr key={e._id} style={{ borderBottom: i < entries.length - 1 ? '1px solid var(--navy-50)' : 'none', background: i % 2 === 0 ? '#fff' : 'var(--navy-25)' }}>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem', color: 'var(--navy-700)', whiteSpace: 'nowrap' }}>
                        {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem' }}>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
                          padding: '2px 8px', borderRadius: 4,
                          background: isCredit ? '#dcfce7' : '#fee2e2',
                          color: isCredit ? '#15803d' : '#dc2626',
                        }}>
                          {isCredit ? '▲ CREDIT' : '▼ DEBIT'}
                        </span>
                        {e.source === 'payment_log' && (
                          <span style={{ fontSize: '0.62rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 5px', borderRadius: 3, marginLeft: 4 }}>pmt</span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: isCredit ? '#15803d' : '#dc2626' }}>
                          {isCredit ? '+' : '−'}{fmtPKR(e.amountPKR)}
                        </div>
                        {e.amountUSD != null && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--navy-400)' }}>${e.amountUSD.toFixed(2)}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem' }}>
                        {e.wallet ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(79,70,229,0.1)', color: 'var(--accent-600)', padding: '2px 7px', borderRadius: 4 }}>
                            {e.wallet.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--navy-300)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem' }}>
                        {e.source === 'payment_log' ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                            Client Payment
                          </span>
                        ) : e.category ? (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 600,
                            padding: '2px 7px', borderRadius: 4,
                            background: `${CAT_TYPE_COLORS[e.category.type] || '#64748b'}18`,
                            color: CAT_TYPE_COLORS[e.category.type] || '#64748b',
                          }}>
                            {e.category.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--navy-300)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.82rem', color: 'var(--navy-700)', maxWidth: 220 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.clientName ? (
                            <span style={{ fontWeight: 600 }}>{e.clientName}</span>
                          ) : e.description ? (
                            e.description
                          ) : (
                            <span style={{ color: 'var(--navy-300)' }}>—</span>
                          )}
                        </div>
                        {e.clientName && e.description && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--navy-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem', fontSize: '0.75rem', color: 'var(--navy-500)', whiteSpace: 'nowrap' }}>
                        {e.enteredBy ? `${e.enteredBy.firstName} ${e.enteredBy.lastName}` : '—'}
                      </td>
                      <td style={{ padding: '0.625rem 0.875rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {/* Screenshot thumbnails (payment log entries) */}
                          {e.screenshots && e.screenshots.length > 0 && (
                            <>
                              {e.screenshots.slice(0, 2).map((url, si) => (
                                <button
                                  key={url}
                                  title="View screenshot"
                                  onClick={() => openLightbox(e.screenshots!, si)}
                                  style={{ background: 'none', border: '1px solid var(--navy-200)', borderRadius: 5, padding: 1, cursor: 'pointer', lineHeight: 0, position: 'relative' }}
                                >
                                  <img
                                    src={toAbsoluteUrl(url)}
                                    alt=""
                                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                                    onError={e => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:var(--navy-50);border-radius:4px;font-size:11px">📄</span>';
                                    }}
                                  />
                                </button>
                              ))}
                              {e.screenshots.length > 2 && (
                                <button
                                  title={`View all ${e.screenshots.length} screenshots`}
                                  onClick={() => openLightbox(e.screenshots!, 0)}
                                  style={{ background: 'var(--navy-100)', border: '1px solid var(--navy-200)', borderRadius: 5, padding: '0 6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, color: 'var(--navy-600)', height: 30 }}
                                >
                                  +{e.screenshots.length - 2}
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                title="View all"
                                onClick={() => openLightbox(e.screenshots!, 0)}
                              >
                                <EyeIcon style={{ width: 13, height: 13 }} />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Download all"
                                onClick={() => e.screenshots!.forEach(url => downloadFile(url))}
                              >
                                <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                              </button>
                            </>
                          )}
                          {/* Edit / Delete for manual entries */}
                          {!e.isAutoEntry && (
                            <>
                              <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => openEntryModal(e)}>
                                <PencilIcon style={{ width: 13, height: 13 }} />
                              </button>
                              <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: '#dc2626' }} onClick={() => deleteEntry(e._id)}>
                                <TrashIcon style={{ width: 13, height: 13 }} />
                              </button>
                            </>
                          )}
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

      {/* ── Add / Edit Entry Modal ─────────────────────────────────────────── */}
      {showEntryModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowEntryModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>{editEntry ? 'Edit Entry' : 'Add Cash Book Entry'}</h2>
              <button onClick={() => setShowEntryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            <form onSubmit={submitEntry} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {/* Type toggle */}
              <div>
                <label className="form-label">Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['debit', 'credit'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setEntryForm(f => ({ ...f, entryType: t }))}
                      style={{
                        flex: 1, padding: '0.5rem', border: '2px solid', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                        borderColor: entryForm.entryType === t ? (t === 'credit' ? '#15803d' : '#dc2626') : 'var(--navy-200)',
                        background: entryForm.entryType === t ? (t === 'credit' ? '#dcfce7' : '#fee2e2') : '#fff',
                        color: entryForm.entryType === t ? (t === 'credit' ? '#15803d' : '#dc2626') : 'var(--navy-400)',
                      }}>
                      {t === 'credit' ? '▲ Credit (In)' : '▼ Debit (Out)'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div>
                  <label className="form-label">Amount (₨) *</label>
                  <input type="number" step="1" min="0.01" required className="form-input"
                    value={entryForm.amountPKR} onChange={e => setEntryForm(f => ({ ...f, amountPKR: e.target.value }))}
                    placeholder="0" autoFocus />
                </div>
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" required className="form-input"
                    value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <div>
                  <label className="form-label">Wallet</label>
                  <select className="form-input" value={entryForm.walletId} onChange={e => setEntryForm(f => ({ ...f, walletId: e.target.value }))}>
                    <option value="">— None —</option>
                    {wallets.filter(w => w.isActive).map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={entryForm.categoryId} onChange={e => setEntryForm(f => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">— None —</option>
                    {categories.filter(c => c.isActive).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Description</label>
                <input type="text" className="form-input"
                  value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Vendor payment, Salary disbursement…" />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEntryModal(false)}>Cancel</button>
                <button type="submit" disabled={savingEntry} className="btn btn-primary" style={{ flex: 1 }}>
                  {savingEntry ? 'Saving…' : editEntry ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Manage Categories Modal ────────────────────────────────────────── */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCatModal(false); }}>
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Expense Categories</h2>
              <button onClick={() => setShowCatModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* Add/Edit form */}
            <div style={{ background: 'var(--navy-25)', border: '1px solid var(--navy-100)', borderRadius: 10, padding: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-500)', marginBottom: '0.625rem' }}>
                {editCatId ? 'Edit Category' : 'New Category'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <label className="form-label">Name *</label>
                  <input type="text" className="form-input" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Server Costs" />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={catForm.type} onChange={e => setCatForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="expense">Expense</option>
                    <option value="advertising">Advertising</option>
                    <option value="salary">Salary</option>
                    <option value="distribution">Partner Distribution</option>
                    <option value="transfer">Wallet Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {editCatId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditCatId(null); setCatForm({ name: '', type: 'expense' }); }}>Cancel</button>
                )}
                <button className="btn btn-primary btn-sm" disabled={savingCat || !catForm.name.trim()} onClick={submitCategory}>
                  {savingCat ? 'Saving…' : editCatId ? 'Update' : '+ Add'}
                </button>
              </div>
            </div>

            {/* Category list */}
            {categories.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--navy-400)' }}>No categories yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {categories.map(c => (
                  <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--navy-100)', borderRadius: 8, padding: '0.5rem 0.75rem', opacity: c.isActive ? 1 : 0.55 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy-800)' }}>{c.name}</span>
                      <span style={{ fontSize: '0.72rem', marginLeft: 8, color: CAT_TYPE_COLORS[c.type] || '#64748b' }}>{c.type}</span>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditCatId(c._id); setCatForm({ name: c.name, type: c.type }); }}>✎</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={() => deleteCategory(c._id)}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Screenshot Lightbox ────────────────────────────────────────────── */}
      {lightboxUrls.length > 0 && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 18, right: 22, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: '1.1rem', zIndex: 10 }}
          >
            <XMarkIcon style={{ width: 22, height: 22 }} />
          </button>

          {/* Counter */}
          <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', fontWeight: 600, zIndex: 10 }}>
            {lightboxIdx + 1} / {lightboxUrls.length}
          </div>

          {/* Prev arrow */}
          {lightboxUrls.length > 1 && (
            <button
              onClick={ev => { ev.stopPropagation(); setLightboxIdx(i => (i - 1 + lightboxUrls.length) % lightboxUrls.length); }}
              style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '10px 8px', cursor: 'pointer', color: '#fff', zIndex: 10 }}
            >
              <ChevronLeftIcon style={{ width: 26, height: 26 }} />
            </button>
          )}

          {/* Image / PDF preview */}
          <div onClick={ev => ev.stopPropagation()} style={{ maxWidth: '88vw', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lightboxUrls[lightboxIdx]?.toLowerCase().endsWith('.pdf') ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: '2rem 3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--navy-700)', marginBottom: '1rem' }}>PDF Document</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <a href={toAbsoluteUrl(lightboxUrls[lightboxIdx])} target="_blank" rel="noreferrer"
                    style={{ padding: '0.5rem 1.25rem', background: 'var(--accent-600)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                    Open PDF
                  </a>
                  <button onClick={() => downloadFile(lightboxUrls[lightboxIdx])}
                    style={{ padding: '0.5rem 1.25rem', background: 'var(--navy-100)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowDownTrayIcon style={{ width: 15, height: 15 }} /> Download
                  </button>
                </div>
              </div>
            ) : (
              <img
                src={toAbsoluteUrl(lightboxUrls[lightboxIdx])}
                alt={`Screenshot ${lightboxIdx + 1}`}
                style={{ maxWidth: '88vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
              />
            )}
          </div>

          {/* Next arrow */}
          {lightboxUrls.length > 1 && (
            <button
              onClick={ev => { ev.stopPropagation(); setLightboxIdx(i => (i + 1) % lightboxUrls.length); }}
              style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: '10px 8px', cursor: 'pointer', color: '#fff', zIndex: 10 }}
            >
              <ChevronRightIcon style={{ width: 26, height: 26 }} />
            </button>
          )}

          {/* Bottom toolbar: thumbnails strip + download all */}
          <div onClick={ev => ev.stopPropagation()} style={{ position: 'absolute', bottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {lightboxUrls.length > 1 && lightboxUrls.map((url, si) => (
              <button key={url} onClick={() => setLightboxIdx(si)}
                style={{ border: si === lightboxIdx ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, padding: 1, background: 'none', cursor: 'pointer', opacity: si === lightboxIdx ? 1 : 0.55 }}>
                <img src={toAbsoluteUrl(url)} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </button>
            ))}
            <button
              onClick={() => downloadFile(lightboxUrls[lightboxIdx])}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}
            >
              <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Download
            </button>
            {lightboxUrls.length > 1 && (
              <button
                onClick={() => lightboxUrls.forEach(url => downloadFile(url))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}
              >
                <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Download All ({lightboxUrls.length})
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default CashBook;
