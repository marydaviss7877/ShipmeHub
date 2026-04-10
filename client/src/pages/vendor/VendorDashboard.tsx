import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useVendorAuth } from '../../contexts/VendorAuthContext';
import {
  CheckCircleIcon, ClockIcon,
  ExclamationTriangleIcon, QueueListIcon,
} from '@heroicons/react/24/outline';

const API = '/api';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open:         { label: 'Open — Claim It',      color: '#0891b2', bg: '#ecfeff' },
  assigned:     { label: 'Claimed — Start Work', color: '#d97706', bg: '#fffbeb' },
  accepted:     { label: 'Accepted',             color: '#2563eb', bg: '#eff6ff' },
  uploaded:     { label: 'Uploaded (cooling)',   color: '#7c3aed', bg: '#f5f3ff' },
  under_review: { label: 'Under Admin Review',   color: '#6366f1', bg: '#eef2ff' },
  completed:    { label: 'Completed',            color: '#059669', bg: '#ecfdf5' },
  cancelled:    { label: 'Cancelled',            color: '#dc2626', bg: '#fef2f2' },
  rejected:     { label: 'Re-upload Required',   color: '#ea580c', bg: '#fff7ed' },
};

const VendorDashboard: React.FC = () => {
  const { token } = useVendorAuth();
  const [jobs,    setJobs]    = useState<any[]>([]);
  const [stats,   setStats]   = useState({ assigned: 0, accepted: 0, completed: 0, earnings: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]  = useState(1);
  const [pages, setPages] = useState(1);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await axios.get(`${API}/vendor-portal/jobs`, { headers: authHeaders, params });
      setJobs(data.jobs);
      setPages(data.pages);

      // Build stats from response
      const s = { assigned: 0, accepted: 0, completed: 0, earnings: 0 };
      data.jobs.forEach((j: any) => {
        if (j.status === 'assigned')  s.assigned++;
        if (j.status === 'accepted')  s.accepted++;
        if (j.status === 'completed') { s.completed++; s.earnings += j.vendorEarning?.totalAmount || 0; }
      });
      setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Earnings data from API
  const [earning, setEarning] = useState<any>(null);
  useEffect(() => {
    axios.get(`${API}/vendor-portal/me`, { headers: authHeaders })
      .then(r => setEarning(r.data.vendor))
      .catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>My Jobs</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
          Manage label generation requests assigned to you
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Awaiting Action', value: (earning ? 0 : stats.assigned), icon: ExclamationTriangleIcon, color: '#d97706' },
          { label: 'In Progress',    value: stats.accepted,   icon: ClockIcon,          color: '#2563eb' },
          { label: 'Completed',      value: stats.completed,  icon: CheckCircleIcon,    color: '#059669' },
          { label: 'Payable Balance', value: `$${(earning?.payableBalance ?? 0).toFixed(2)}`, icon: QueueListIcon, color: '#6366f1' },
        ].map(s => (
          <div key={s.label} className="sh-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <s.icon style={{ width: 18, height: 18, color: s.color }} />
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {['', 'open', 'assigned', 'accepted', 'uploaded', 'under_review', 'completed', 'rejected', 'cancelled'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className="btn btn-ghost btn-sm"
            style={{ background: statusFilter === s ? '#0f172a' : undefined, color: statusFilter === s ? '#fff' : undefined }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="sh-card" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <QueueListIcon style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontWeight: 600, color: '#64748b' }}>No jobs found</p>
        </div>
      ) : (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Carrier</th>
                <th>Labels</th>
                <th>Your Earning</th>
                <th>Status</th>
                <th>Received</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => {
                const st = STATUS_LABELS[job.status] || { label: job.status, color: '#64748b', bg: '#f1f5f9' };
                return (
                  <tr key={job._id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>
                      {job._id.slice(-8).toUpperCase()}
                    </td>
                    <td><span className="carrier-badge usps" style={{ textTransform: 'uppercase' }}>{job.carrier}</span></td>
                    <td style={{ fontWeight: 600 }}>{job.requestFile?.labelCount ?? '—'}</td>
                    <td style={{ fontWeight: 600, color: '#059669' }}>
                      ${(job.vendorEarning?.totalAmount ?? 0).toFixed(2)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 99,
                        fontSize: '0.72rem', fontWeight: 600,
                        background: st.bg, color: st.color,
                      }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      {job.status === 'open' ? (
                        <Link to={`/vendor-portal/jobs/${job._id}`} className="btn btn-primary btn-sm">
                          Accept Job →
                        </Link>
                      ) : (
                        <Link to={`/vendor-portal/jobs/${job._id}`} className="btn btn-ghost btn-sm">
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
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

export default VendorDashboard;
