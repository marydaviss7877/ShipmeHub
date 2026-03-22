import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  TruckIcon, MegaphoneIcon, PlusIcon, PencilIcon, TrashIcon,
  CheckCircleIcon, XMarkIcon, BookmarkIcon,
} from '@heroicons/react/24/outline';

interface Announcement {
  _id: string;
  title: string;
  content: string;
  category: 'general' | 'service' | 'pricing' | 'maintenance';
  isPinned: boolean;
  isActive: boolean;
  createdBy?: { firstName: string; lastName: string };
  createdAt: string;
}

const CARRIER_INFO = [
  { name: 'USPS',  color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', desc: 'United States Postal Service — Ground Advantage, Priority Mail, Priority Express' },
  { name: 'UPS',   color: '#92400E', bg: '#FFFBEB', border: '#FDE68A', desc: 'UPS Ground, 2nd Day Air, Next Day Air, and international services' },
  { name: 'FedEx', color: '#5B21B6', bg: '#F5F3FF', border: '#DDD6FE', desc: 'FedEx Ground, Express Saver, 2Day, Overnight, and international freight' },
  { name: 'DHL',   color: '#78350F', bg: '#FEF3C7', border: '#FDE68A', desc: 'DHL Express worldwide — international priority and economy services' },
];

const CAT_BADGE: Record<string, string> = {
  general:     'badge badge-gray',
  service:     'badge badge-blue',
  pricing:     'badge badge-green',
  maintenance: 'badge badge-amber',
};

type Category = 'general' | 'service' | 'pricing' | 'maintenance';
const BLANK: { title: string; content: string; category: Category; isPinned: boolean } = {
  title: '', content: '', category: 'general', isPinned: false,
};

const Carriers: React.FC = () => {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const isAdmin     = user?.role === 'admin';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [editing,       setEditing]       = useState<Announcement | null>(null);
  const [form,          setForm]          = useState(BLANK);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  useEffect(() => { fetchAnnouncements(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/announcements/all' : '/announcements';
      const res = await axios.get(endpoint);
      setAnnouncements(res.data.announcements || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(BLANK); setShowForm(true); setError(''); };
  const openEdit   = (a: Announcement) => {
    setEditing(a);
    setForm({ title: a.title, content: a.content, category: a.category, isPinned: a.isPinned });
    setShowForm(true); setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (editing) {
        await axios.put(`/announcements/${editing._id}`, form);
      } else {
        await axios.post('/announcements', form);
      }
      setShowForm(false); setEditing(null);
      fetchAnnouncements();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (a: Announcement) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try { await axios.delete(`/announcements/${a._id}`); fetchAnnouncements(); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed'); }
  };

  const toggleActive = async (a: Announcement) => {
    try { await axios.put(`/announcements/${a._id}`, { isActive: !a.isActive }); fetchAnnouncements(); }
    catch (err: any) { console.error(err); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }} className="animate-fadeIn">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">Available shipping carriers and platform announcements.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            <PlusIcon style={{ width: 15, height: 15 }} /> New Announcement
          </button>
        )}
      </div>

      {/* ── Carrier info cards ──────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.875rem' }}>
          Available Carriers
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {CARRIER_INFO.map(c => (
            <div key={c.name} className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1.125rem 1.25rem', background: c.bg, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TruckIcon style={{ width: 20, height: 20, color: '#fff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: c.color, letterSpacing: '-0.01em' }}>{c.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>{c.desc}</div>
                </div>
              </div>
              <div style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--navy-400)' }}>Single &amp; bulk label generation available</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/labels/single')}
                >
                  Generate Label
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Announcements ───────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Announcements
          </h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
        ) : announcements.length === 0 ? (
          <div className="sh-card empty-state" style={{ padding: '3rem' }}>
            <MegaphoneIcon style={{ width: 36, height: 36 }} />
            <h3>No announcements yet</h3>
            {isAdmin && <p>Create the first announcement to inform your users.</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {announcements.map(a => (
              <div key={a._id} className="sh-card" style={{ padding: '1.125rem 1.25rem', opacity: (!a.isActive && isAdmin) ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {a.isPinned && (
                    <BookmarkIcon style={{ width: 15, height: 15, color: 'var(--accent-500)', flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)' }}>{a.title}</span>
                      <span className={CAT_BADGE[a.category] || 'badge badge-gray'} style={{ fontSize: '0.6rem' }}>{a.category}</span>
                      {isAdmin && !a.isActive && <span className="badge badge-red" style={{ fontSize: '0.6rem' }}>Hidden</span>}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--navy-600)', margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{a.content}</p>
                    <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)' }}>
                      {fmtDate(a.createdAt)}
                      {a.createdBy && ` · ${a.createdBy.firstName} ${a.createdBy.lastName}`}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button title={a.isActive ? 'Hide' : 'Show'} onClick={() => toggleActive(a)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: a.isActive ? 'var(--success-500)' : 'var(--navy-400)', padding: 4 }}>
                        <CheckCircleIcon style={{ width: 15, height: 15 }} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(a)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 4 }}>
                        <PencilIcon style={{ width: 15, height: 15 }} />
                      </button>
                      <button title="Delete" onClick={() => handleDelete(a)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-500)', padding: 4 }}>
                        <TrashIcon style={{ width: 15, height: 15 }} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 className="modal-title">{editing ? 'Edit Announcement' : 'New Announcement'}</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label className="form-label">Title *</label>
                <input type="text" required className="form-input" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. New USPS rates effective March 2026" />
              </div>
              <div>
                <label className="form-label">Content *</label>
                <textarea required rows={4} className="form-input" value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Announcement details…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="form-label">Category</label>
                  <select className="form-input form-select" value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value as Category })}>
                    <option value="general">General</option>
                    <option value="service">Service</option>
                    <option value="pricing">Pricing</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.125rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--navy-700)' }}>
                    <input type="checkbox" checked={form.isPinned}
                      onChange={e => setForm({ ...form, isPinned: e.target.checked })} />
                    Pin to top
                  </label>
                </div>
              </div>
              {error && (
                <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem' }}>
                  <XMarkIcon style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: '0.8rem' }}>{error}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Publish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Carriers;
