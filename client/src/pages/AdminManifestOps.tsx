import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowPathIcon, CheckIcon, XMarkIcon,
  ArrowDownTrayIcon, PlusIcon, TrashIcon, FunnelIcon,
} from '@heroicons/react/24/outline';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: 'Pending',           color: '#64748b', bg: '#f1f5f9' },
  assigned:     { label: 'Assigned',           color: '#d97706', bg: '#fffbeb' },
  accepted:     { label: 'Accepted',           color: '#2563eb', bg: '#eff6ff' },
  uploaded:     { label: 'Uploaded',           color: '#7c3aed', bg: '#f5f3ff' },
  under_review: { label: 'Under Review',       color: '#6366f1', bg: '#eef2ff' },
  completed:    { label: 'Completed',          color: '#059669', bg: '#ecfdf5' },
  cancelled:    { label: 'Cancelled',          color: '#dc2626', bg: '#fef2f2' },
  rejected:     { label: 'Rejected',           color: '#ea580c', bg: '#fff7ed' },
};

const AdminManifestOps: React.FC = () => {
  const { token } = useAuth() as any;
  const authH = { Authorization: `Bearer ${token}` };

  // Jobs tab
  const [jobs,     setJobs]     = useState<any[]>([]);
  const [jobsLoad, setJobsLoad] = useState(true);
  const [stats,    setStats]    = useState<any>({});
  const [statusF,  setStatusF]  = useState('');
  const [carrierF, setCarrierF] = useState('');
  const [jobPage,  setJobPage]  = useState(1);
  const [jobPages, setJobPages] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);

  // Assignment tab
  const [tab,         setTab]         = useState<'jobs' | 'assignments'>('jobs');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assLoad,     setAssLoad]     = useState(false);
  const [allUsers,    setAllUsers]    = useState<any[]>([]);
  const [allVendors,  setAllVendors]  = useState<any[]>([]);
  const [newAss,      setNewAss]      = useState({ userId: '', carrier: '', vendorId: '', notes: '' });

  // Modal state
  const [modal, setModal] = useState<{ type: string; job: any } | null>(null);
  const [reason, setReason] = useState('');
  const [reassignVendor, setReassignVendor] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');

  const fetchJobs = useCallback(async () => {
    setJobsLoad(true);
    try {
      const params: any = { page: jobPage, limit: 20 };
      if (statusF)  params.status  = statusF;
      if (carrierF) params.carrier = carrierF;
      const [{ data: jd }, { data: sd }] = await Promise.all([
        axios.get(`${API}/admin/manifest`, { headers: authH, params }),
        axios.get(`${API}/admin/manifest/stats`, { headers: authH }),
      ]);
      setJobs(jd.jobs);
      setJobPages(jd.pages);
      setJobTotal(jd.total);
      setStats(sd);
    } catch { }
    setJobsLoad(false);
  }, [token, jobPage, statusF, carrierF]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAssignments = useCallback(async () => {
    setAssLoad(true);
    try {
      const [{ data: ad }, { data: ud }, { data: vd }] = await Promise.all([
        axios.get(`${API}/admin/manifest/assignments/list`, { headers: authH }),
        axios.get(`${API}/users`, { headers: authH }),
        axios.get(`${API}/manifest-vendors`, { headers: authH }),
      ]);
      setAssignments(ad.assignments);
      setAllUsers(ud.users || []);
      setAllVendors(vd.vendors || []);
    } catch { }
    setAssLoad(false);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { if (tab === 'assignments') fetchAssignments(); }, [tab, fetchAssignments]);

  const doAction = async (type: 'approve' | 'reject' | 'cancel' | 'assign', jobId: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      if (type === 'approve') {
        await axios.put(`${API}/admin/manifest/${jobId}/approve`, { notes: reason }, { headers: authH });
      } else if (type === 'reject') {
        if (!reason.trim()) { setActionError('Rejection reason is required'); setActionLoading(false); return; }
        await axios.put(`${API}/admin/manifest/${jobId}/reject`, { reason }, { headers: authH });
      } else if (type === 'cancel') {
        await axios.put(`${API}/admin/manifest/${jobId}/cancel`, { reason }, { headers: authH });
      } else if (type === 'assign') {
        if (!reassignVendor) { setActionError('Select a vendor'); setActionLoading(false); return; }
        await axios.put(`${API}/admin/manifest/${jobId}/assign`, { vendorId: reassignVendor, notes: reason }, { headers: authH });
      }
      setModal(null);
      setReason('');
      setReassignVendor('');
      fetchJobs();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const createAssignment = async () => {
    if (!newAss.userId || !newAss.carrier || !newAss.vendorId) return;
    try {
      await axios.post(`${API}/admin/manifest/assignments`, newAss, { headers: authH });
      setNewAss({ userId: '', carrier: '', vendorId: '', notes: '' });
      fetchAssignments();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error saving assignment');
    }
  };

  const deleteAssignment = async (id: string) => {
    if (!window.confirm('Remove this assignment?')) return;
    await axios.delete(`${API}/admin/manifest/assignments/${id}`, { headers: authH });
    fetchAssignments();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Manifest Operations</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>Manage manifested label jobs and vendor routing</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total',        value: stats.total       ?? 0, color: '#334155' },
          { label: 'Pending',      value: stats.pending     ?? 0, color: '#64748b' },
          { label: 'Assigned',     value: stats.assigned    ?? 0, color: '#d97706' },
          { label: 'In Progress',  value: stats.accepted    ?? 0, color: '#2563eb' },
          { label: 'Under Review', value: stats.underReview ?? 0, color: '#6366f1' },
          { label: 'Completed',    value: stats.completed   ?? 0, color: '#059669' },
        ].map(s => (
          <div key={s.label} className="sh-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {(['jobs', 'assignments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontWeight: 600, fontSize: '0.875rem', border: 'none',
            background: 'none', cursor: 'pointer', textTransform: 'capitalize',
            color:        tab === t ? '#2563eb' : '#64748b',
            borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'jobs' ? 'Job Queue' : 'Vendor Routing'}
          </button>
        ))}
      </div>

      {/* ─── JOBS TAB ─────────────────────────────────────────────────── */}
      {tab === 'jobs' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <FunnelIcon style={{ width: 16, height: 16, color: '#94a3b8' }} />
            <select value={statusF} onChange={e => { setStatusF(e.target.value); setJobPage(1); }} className="form-input form-select" style={{ width: 170 }}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={carrierF} onChange={e => { setCarrierF(e.target.value); setJobPage(1); }} className="form-input form-select" style={{ width: 130 }}>
              <option value="">All Carriers</option>
              {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: 4 }}>{jobTotal} jobs</span>
          </div>

          {jobsLoad ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div className="sh-card" style={{ overflow: 'hidden' }}>
              <table className="sh-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>User</th>
                    <th>Carrier</th>
                    <th>Labels</th>
                    <th>User Paid</th>
                    <th>Vendor Earn</th>
                    <th>Status</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job: any) => {
                    const sm = STATUS_META[job.status] || { label: job.status, color: '#64748b', bg: '#f1f5f9' };
                    const canApprove = ['uploaded', 'under_review'].includes(job.status);
                    const canReject  = canApprove;
                    const canCancel  = !['completed', 'cancelled'].includes(job.status);
                    const canAssign  = !['completed', 'cancelled'].includes(job.status);
                    return (
                      <tr key={job._id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                          {job._id.slice(-8).toUpperCase()}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                            {job.user?.firstName} {job.user?.lastName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{job.user?.email}</div>
                        </td>
                        <td><span className="carrier-badge usps">{job.carrier}</span></td>
                        <td style={{ fontWeight: 600 }}>{job.requestFile?.labelCount ?? '—'}</td>
                        <td style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.85rem' }}>
                          ${(job.userBilling?.totalAmount ?? 0).toFixed(2)}
                        </td>
                        <td style={{ fontWeight: 600, color: '#059669', fontSize: '0.85rem' }}>
                          ${(job.vendorEarning?.totalAmount ?? 0).toFixed(2)}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: 99,
                            fontSize: '0.7rem', fontWeight: 600, background: sm.bg, color: sm.color,
                          }}>{sm.label}</span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                          {job.assignedVendor?.name ?? '—'}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {new Date(job.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {/* Download request file */}
                            <button
                              onClick={() => window.open(`${API}/admin/manifest/${job._id}/download-request`, '_blank')}
                              className="btn btn-ghost btn-sm" title="Download request CSV"
                              style={{ padding: '4px 8px' }}>
                              <ArrowDownTrayIcon style={{ width: 13, height: 13 }} />
                            </button>
                            {/* Download result file */}
                            {['uploaded', 'under_review', 'completed'].includes(job.status) && (
                              <button
                                onClick={() => window.open(`${API}/admin/manifest/${job._id}/download-result`, '_blank')}
                                className="btn btn-success btn-sm" title="Download result"
                                style={{ padding: '4px 8px' }}>
                                <CheckIcon style={{ width: 13, height: 13 }} />
                              </button>
                            )}
                            {/* Approve */}
                            {canApprove && (
                              <button onClick={() => { setModal({ type: 'approve', job }); setReason(''); setActionError(''); }}
                                className="btn btn-success btn-sm" title="Approve">
                                Approve
                              </button>
                            )}
                            {/* Reject */}
                            {canReject && (
                              <button onClick={() => { setModal({ type: 'reject', job }); setReason(''); setActionError(''); }}
                                className="btn btn-danger btn-sm" title="Reject">
                                Reject
                              </button>
                            )}
                            {/* Reassign */}
                            {canAssign && (
                              <button onClick={() => { setModal({ type: 'assign', job }); setReason(''); setReassignVendor(''); setActionError(''); }}
                                className="btn btn-ghost btn-sm" title="Reassign vendor">
                                <ArrowPathIcon style={{ width: 13, height: 13 }} />
                              </button>
                            )}
                            {/* Cancel */}
                            {canCancel && (
                              <button onClick={() => { setModal({ type: 'cancel', job }); setReason(''); setActionError(''); }}
                                className="btn btn-ghost btn-sm" title="Cancel" style={{ color: '#dc2626' }}>
                                <XMarkIcon style={{ width: 13, height: 13 }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {jobPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '1rem' }}>
                  <button disabled={jobPage === 1}         onClick={() => setJobPage(p => p - 1)} className="btn btn-ghost btn-sm">Prev</button>
                  <span style={{ lineHeight: '32px', fontSize: '0.85rem', color: '#64748b' }}>{jobPage} / {jobPages}</span>
                  <button disabled={jobPage === jobPages}  onClick={() => setJobPage(p => p + 1)} className="btn btn-ghost btn-sm">Next</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── ASSIGNMENTS TAB ──────────────────────────────────────────── */}
      {tab === 'assignments' && (
        <div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 20 }}>
            Pre-configure which vendor handles each carrier for each user. When a user submits a manifest, it auto-routes to their assigned vendor.
          </p>

          {/* Add new assignment */}
          <div className="sh-card" style={{ padding: '1.5rem', marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: 14 }}>
              <PlusIcon style={{ width: 16, height: 16, display: 'inline', marginRight: 6 }} />
              Add / Update Assignment
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="form-label">User *</label>
                <select value={newAss.userId} onChange={e => setNewAss(p => ({ ...p, userId: e.target.value }))} className="form-input form-select">
                  <option value="">Select user…</option>
                  {allUsers.map((u: any) => (
                    <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Carrier *</label>
                <select value={newAss.carrier} onChange={e => setNewAss(p => ({ ...p, carrier: e.target.value }))} className="form-input form-select">
                  <option value="">Select carrier…</option>
                  {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Vendor *</label>
                <select value={newAss.vendorId} onChange={e => setNewAss(p => ({ ...p, vendorId: e.target.value }))} className="form-input form-select">
                  <option value="">Select vendor…</option>
                  {allVendors.filter((v: any) => !newAss.carrier || v.carriers?.includes(newAss.carrier)).map((v: any) => (
                    <option key={v._id} value={v._id}>{v.name} ({v.carriers?.join(', ')})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <input value={newAss.notes} onChange={e => setNewAss(p => ({ ...p, notes: e.target.value }))} className="form-input" placeholder="Optional notes" />
              </div>
            </div>
            <button
              onClick={createAssignment}
              disabled={!newAss.userId || !newAss.carrier || !newAss.vendorId}
              className="btn btn-primary">
              Save Assignment
            </button>
          </div>

          {/* Assignment list */}
          {assLoad ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div className="sh-card" style={{ overflow: 'hidden' }}>
              <table className="sh-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Carrier</th>
                    <th>Assigned Vendor</th>
                    <th>Notes</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No assignments configured</td></tr>
                  ) : assignments.map((a: any) => (
                    <tr key={a._id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.user?.firstName} {a.user?.lastName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{a.user?.email}</div>
                      </td>
                      <td><span className="carrier-badge usps">{a.carrier}</span></td>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.vendor?.name}</td>
                      <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{a.notes || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => deleteAssignment(a._id)} className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }}>
                          <TrashIcon style={{ width: 14, height: 14 }} />
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

      {/* ─── MODAL ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title" style={{ textTransform: 'capitalize' }}>
              {modal.type === 'assign' ? 'Reassign Vendor' : modal.type} Job #{modal.job._id.slice(-8).toUpperCase()}
            </h3>

            {actionError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{actionError}</div>}

            {modal.type === 'assign' && (
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Select New Vendor *</label>
                <select value={reassignVendor} onChange={e => setReassignVendor(e.target.value)} className="form-input form-select">
                  <option value="">Choose vendor…</option>
                  {allVendors.filter((v: any) => v.carriers?.includes(modal.job.carrier) && v.isActive).map((v: any) => (
                    <option key={v._id} value={v._id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">
                {modal.type === 'reject' ? 'Rejection Reason *' : 'Notes (optional)'}
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="form-input"
                rows={3}
                placeholder={modal.type === 'reject' ? 'Explain why the upload is rejected…' : 'Optional notes…'}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} className="btn btn-ghost" disabled={actionLoading}>Cancel</button>
              <button
                onClick={() => doAction(modal.type as any, modal.job._id)}
                disabled={actionLoading}
                className={`btn ${modal.type === 'approve' || modal.type === 'assign' ? 'btn-primary' : modal.type === 'reject' || modal.type === 'cancel' ? 'btn-danger' : 'btn-primary'}`}
              >
                {actionLoading ? 'Processing…' : `Confirm ${modal.type.charAt(0).toUpperCase() + modal.type.slice(1)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManifestOps;
