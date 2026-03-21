import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  CloudArrowUpIcon, DocumentArrowDownIcon,
  CheckCircleIcon, XMarkIcon, TruckIcon,
} from '@heroicons/react/24/outline';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const CSV_TEMPLATE = `from_name,from_company,from_address1,from_address2,from_city,from_state,from_zip,to_name,to_company,to_address1,to_address2,to_city,to_state,to_zip,weight,length,width,height,reference
John Doe,,123 Main St,,Springfield,IL,62701,Jane Smith,,456 Oak Ave,,Chicago,IL,60601,2.5,12,8,4,ORD-001`;

const ManifestUpload: React.FC = () => {
  const { token, user } = useAuth() as any;
  const navigate        = useNavigate();
  const fileInputRef    = useRef<HTMLInputElement>(null);

  const [carrier,     setCarrier]     = useState<string>('');
  const [file,        setFile]        = useState<File | null>(null);
  const [preview,     setPreview]     = useState<{ rows: number; errors: string[] } | null>(null);
  const [balance,     setBalance]     = useState<number | null>(null);
  const [assignments, setAssignments] = useState<string[]>([]); // carriers with active assignment
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState<any>(null);
  const [dragging,    setDragging]    = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Fetch user balance & allowed carriers (from assignments)
  useEffect(() => {
    axios.get(`${API}/balance`, { headers: authHeaders })
      .then(r => setBalance(r.data.currentBalance ?? r.data.balance?.currentBalance ?? 0))
      .catch(() => {});

    // We use UserVendorAccess carriers as proxy for allowed carriers
    axios.get(`${API}/access/me`, { headers: authHeaders })
      .then(r => {
        const all = r.data.access?.map((a: any) => a.carrier) as string[] || [];
        const carriers = all.filter((c, i) => all.indexOf(c) === i);
        setAssignments(carriers);
      })
      .catch(() => {});
  }, [token]);

  const parsePreview = (f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text  = e.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const errors: string[] = [];
      if (lines.length <= 1) { errors.push('File has no data rows'); }
      else {
        const headers = lines[0].toLowerCase().split(',').map(h => h.replace(/"/g, '').trim());
        const required = ['from_name', 'from_address1', 'from_city', 'from_state', 'from_zip',
                          'to_name', 'to_address1', 'to_city', 'to_state', 'to_zip', 'weight'];
        required.forEach(h => { if (!headers.includes(h)) errors.push(`Missing column: ${h}`); });
      }
      setPreview({ rows: Math.max(0, lines.length - 1), errors });
    };
    reader.readAsText(f);
  };

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) { setError('Only CSV files are accepted'); return; }
    setFile(f);
    setError('');
    parsePreview(f);
  };

  const handleSubmit = async () => {
    if (!carrier) { setError('Please select a carrier'); return; }
    if (!file)    { setError('Please upload a CSV file'); return; }
    if (preview?.errors.length) { setError('Fix CSV errors before submitting'); return; }

    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('carrier', carrier);
      form.append('file', file);
      const { data } = await axios.post(`${API}/manifest`, form, {
        headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
      });
      setSuccess(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'manifest_template.csv';
    a.click();
  };

  if (success) {
    return (
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '2rem 0' }}>
        <div className="sh-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <CheckCircleIcon style={{ width: 52, height: 52, color: '#059669', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Request Submitted!</h2>
          <p style={{ color: '#475569', marginBottom: 20 }}>
            Your {success.job.carrier} manifest has been sent to the vendor.<br/>
            <strong>{success.job.labelCount} labels</strong> · <strong>${success.job.totalCost?.toFixed(2)}</strong> deducted
          </p>
          <div style={{ background: '#f1f5f9', borderRadius: 10, padding: '1rem', marginBottom: 24, textAlign: 'left' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Job ID</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{success.job._id}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => navigate('/labels/bulk')} className="btn btn-primary">Back to Bulk Labels</button>
            <button onClick={() => { setSuccess(null); setFile(null); setCarrier(''); setPreview(null); }} className="btn btn-ghost">
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Submit Manifest Labels</h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 4 }}>
          Upload a CSV and we'll route it to your assigned vendor for label generation.
        </p>
      </div>

      {/* Balance */}
      {typeof balance === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
          <span style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>
            Available Balance: ${balance.toFixed(2)}
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <XMarkIcon style={{ width: 16, height: 16 }} /> {error}
        </div>
      )}

      <div className="sh-card" style={{ padding: '1.75rem', marginBottom: 20 }}>
        {/* Carrier selection */}
        <div style={{ marginBottom: 24 }}>
          <label className="form-label">Select Carrier *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
            {CARRIERS.map(c => (
              <button key={c} onClick={() => setCarrier(c)} type="button" style={{
                padding: '12px 8px', borderRadius: 10, border: '2px solid',
                borderColor:  carrier === c ? '#2563eb' : '#e2e8f0',
                background:   carrier === c ? '#eff6ff' : '#fff',
                color:        carrier === c ? '#1d4ed8' : '#334155',
                fontWeight:   700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 150ms',
              }}>
                <TruckIcon style={{ width: 18, height: 18, margin: '0 auto 4px', display: 'block' }} />
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Template download */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={downloadTemplate} className="btn btn-ghost btn-sm">
            <DocumentArrowDownIcon style={{ width: 15, height: 15 }} /> Download CSV Template
          </button>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: 8 }}>
            Use this template to format your shipping data
          </span>
        </div>

        {/* File drop zone */}
        <div>
          <label className="form-label">Upload CSV File *</label>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border:     `2px dashed ${dragging ? '#2563eb' : '#cbd5e1'}`,
              borderRadius: 12, padding: '2rem', textAlign: 'center',
              background: dragging ? '#eff6ff' : '#f8fafc',
              cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            <CloudArrowUpIcon style={{ width: 36, height: 36, color: '#94a3b8', margin: '0 auto 10px' }} />
            {file ? (
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{file.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, color: '#334155' }}>Drop CSV here or click to browse</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>CSV files only, max 10 MB</div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files?.[0] || null)} />
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: preview.errors.length ? '#fef2f2' : '#f0fdf4', border: `1px solid ${preview.errors.length ? '#fca5a5' : '#bbf7d0'}` }}>
            {preview.errors.length > 0 ? (
              <>
                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>CSV Errors</div>
                {preview.errors.map((e, i) => <div key={i} style={{ fontSize: '0.82rem', color: '#dc2626' }}>• {e}</div>)}
              </>
            ) : (
              <div style={{ fontWeight: 600, color: '#166534' }}>
                ✓ {preview.rows} label rows detected — ready to submit
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !carrier || !file || (preview?.errors.length ?? 0) > 0}
        className="btn btn-primary btn-lg"
        style={{ width: '100%' }}
      >
        {submitting ? 'Submitting…' : `Submit Manifest Request`}
      </button>
      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
        Your balance will be deducted immediately based on label count and weight tiers.
      </p>
    </div>
  );
};

export default ManifestUpload;
