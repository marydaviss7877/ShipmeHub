import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useVendorAuth } from '../../contexts/VendorAuthContext';
import { CurrencyDollarIcon } from '@heroicons/react/24/outline';

const API = '';

const VendorEarnings: React.FC = () => {
  const { token } = useVendorAuth();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/vendor-portal/earnings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Earnings</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>Your completed jobs and payable balance</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Payable Balance',  value: `$${(data?.payableBalance ?? 0).toFixed(2)}`, color: '#059669' },
          { label: 'Total Paid Out',  value: `$${(data?.totalPaidOut  ?? 0).toFixed(2)}`, color: '#2563eb' },
          { label: 'Rate Per Label',  value: `$${(data?.vendorRate    ?? 0).toFixed(2)}`, color: '#d97706' },
          { label: 'Jobs Completed',  value:    data?.jobs?.length ?? 0,                  color: '#6366f1' },
        ].map(s => (
          <div key={s.label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Job list */}
      {data?.jobs?.length > 0 ? (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Carrier</th>
                <th>Labels</th>
                <th>Rate</th>
                <th>Earned</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job: any) => (
                <tr key={job._id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>
                    {job._id.slice(-8).toUpperCase()}
                  </td>
                  <td><span className="carrier-badge usps">{job.carrier}</span></td>
                  <td style={{ fontWeight: 600 }}>{job.requestFile?.labelCount ?? '—'}</td>
                  <td>${(job.vendorEarning?.ratePerLabel ?? 0).toFixed(2)}</td>
                  <td style={{ fontWeight: 700, color: '#059669' }}>${(job.vendorEarning?.totalAmount ?? 0).toFixed(2)}</td>
                  <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                    {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sh-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <CurrencyDollarIcon style={{ width: 40, height: 40, margin: '0 auto 12px', color: '#cbd5e1' }} />
          <p style={{ color: '#64748b', fontWeight: 600 }}>No completed jobs yet</p>
        </div>
      )}
    </div>
  );
};

export default VendorEarnings;
