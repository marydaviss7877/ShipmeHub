import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: 'Pending',        color: '#64748b', bg: '#f1f5f9' },
  open:         { label: 'Open',           color: '#0891b2', bg: '#ecfeff' },
  assigned:     { label: 'Assigned',       color: '#d97706', bg: '#fffbeb' },
  accepted:     { label: 'In Progress',    color: '#2563eb', bg: '#eff6ff' },
  uploaded:     { label: 'Uploaded',       color: '#7c3aed', bg: '#f5f3ff' },
  under_review: { label: 'Under Review',   color: '#6366f1', bg: '#eef2ff' },
  completed:    { label: 'Completed',      color: '#059669', bg: '#ecfdf5' },
  cancelled:    { label: 'Cancelled',      color: '#dc2626', bg: '#fef2f2' },
  rejected:     { label: 'Rejected',       color: '#ea580c', bg: '#fff7ed' },
};

const ManifestHistory: React.FC = () => {
  const { token } = useAuth() as any;
  const [jobs,    setJobs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [pages,   setPages]   = useState(1);
  const [total,   setTotal]   = useState(0);
  const [statusF, setStatusF] = useState('');
  const [carrierF,setCarrierF]= useState('');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (statusF)  params.status  = statusF;
      if (carrierF) params.carrier = carrierF;
      const { data } = await axios.get(`${API}/manifest`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setJobs(data.jobs);
      setPages(data.pages);
      setTotal(data.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, page, statusF, carrierF]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleDownload = (jobId: string) => {
    window.open(`${API}/manifest/${jobId}/download?token=${token}`, '_blank');
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title">Manifest History</h1>
          <p className="page-subtitle">Track all your manifested label requests</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchJobs}>
          <ArrowPathIcon style={{ width: 15, height: 15 }} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={statusF}
          onChange={e => { setStatusF(e.target.value); setPage(1); }}
          className="form-input form-select"
          style={{ width: 170 }}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={carrierF}
          onChange={e => { setCarrierF(e.target.value); setPage(1); }}
          className="form-input form-select"
          style={{ width: 130 }}
        >
          <option value="">All Carriers</option>
          {['USPS', 'UPS', 'FedEx', 'DHL'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{total} job{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="sh-card" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          No manifest jobs found.
        </div>
      ) : (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Carrier</th>
                <th>Labels</th>
                <th>Amount Paid</th>
                <th>Status</th>
                <th>Vendor</th>
                <th>Date</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => {
                const sm = STATUS_META[job.status] || { label: job.status, color: '#64748b', bg: '#f1f5f9' };
                return (
                  <tr key={job._id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                      {job._id.slice(-8).toUpperCase()}
                    </td>
                    <td><span className="carrier-badge usps">{job.carrier}</span></td>
                    <td style={{ fontWeight: 600 }}>
                      {job.requestFile?.labelCount ?? job.userBilling?.labelCount ?? '—'}
                    </td>
                    <td style={{ fontWeight: 600, color: '#dc2626', fontSize: '0.85rem' }}>
                      ${(job.userBilling?.totalAmount ?? 0).toFixed(2)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 99,
                        fontSize: '0.7rem', fontWeight: 600,
                        background: sm.bg, color: sm.color,
                      }}>
                        {sm.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                      {job.assignedVendor?.name ?? '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      {job.status === 'completed' ? (
                        <button
                          onClick={() => handleDownload(job._id)}
                          className="btn btn-success btn-sm"
                          title="Download labels"
                          style={{ padding: '4px 8px' }}
                        >
                          <ArrowDownTrayIcon style={{ width: 14, height: 14 }} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '1rem' }}>
              <button disabled={page === 1}     onClick={() => setPage(p => p - 1)} className="btn btn-ghost btn-sm">Prev</button>
              <span style={{ lineHeight: '32px', fontSize: '0.85rem', color: '#64748b' }}>{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="btn btn-ghost btn-sm">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManifestHistory;
