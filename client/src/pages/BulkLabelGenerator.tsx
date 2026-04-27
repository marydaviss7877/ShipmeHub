import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';
import {
  TruckIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon,
  ExclamationCircleIcon, DocumentTextIcon, XMarkIcon, ClockIcon,
  ClipboardDocumentListIcon, PlusIcon, TrashIcon,
  ArrowLeftIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { getUspsZone1Rate } from '../utils/uspsRates';

// ── Types ─────────────────────────────────────────────────────
interface AccessItem {
  vendorId:        string;
  vendorName:      string;
  carrier:         string;
  vendorType:      'api' | 'manifest';
  shippingService: string;
  baseRate:        number;
  isAllowed:       boolean;
  rateTiers:       { minLbs: number; maxLbs: number | null; rate: number }[];
}

interface LabelRow  { [key: string]: string; }
interface RowResult { success: boolean; trackingId?: string; pdfUrl?: string; error?: string; }

interface ApiResult {
  type:       'api';
  bulkJobId:  string;
  results:    RowResult[];
  zipUrl:     string | null;
  newBalance: number;
}

interface ManifestResult {
  type:          'manifest';
  manifestJobId: string;
  status:        string;
  labelCount:    number;
  carrier:       string;
  vendorName:    string;
  totalCost:     number;
  newBalance:    number;
}

// ── Constants ─────────────────────────────────────────────────
const REQUIRED_COLS = [
  'from_name','from_address1','from_city','from_state','from_zip',
  'to_name','to_address1','to_city','to_state','to_zip','weight',
];

const ALL_COLS = [
  'from_name','from_company','from_phone','from_address1','from_address2','from_city','from_state','from_zip',
  'to_name','to_company','to_phone','to_address1','to_address2','to_city','to_state','to_zip',
  'weight','length','width','height','note',
];

// Columns shown in the editable table (compact view)
const TABLE_COLS: { key: string; label: string; width: number; required: boolean }[] = [
  { key: 'from_name',     label: 'From Name',    width: 130, required: true },
  { key: 'from_address1', label: 'From Addr',    width: 150, required: true },
  { key: 'from_city',     label: 'F. City',      width: 100, required: true },
  { key: 'from_state',    label: 'F.St',         width: 60,  required: true },
  { key: 'from_zip',      label: 'F.Zip',        width: 80,  required: true },
  { key: 'to_name',       label: 'To Name',      width: 130, required: true },
  { key: 'to_address1',   label: 'To Addr',      width: 150, required: true },
  { key: 'to_city',       label: 'T. City',      width: 100, required: true },
  { key: 'to_state',      label: 'T.St',         width: 60,  required: true },
  { key: 'to_zip',        label: 'T.Zip',        width: 80,  required: true },
  { key: 'weight',        label: 'Wt (lbs)',     width: 80,  required: true },
  { key: 'length',        label: 'Len',          width: 65,  required: false },
  { key: 'width',         label: 'Wid',          width: 65,  required: false },
  { key: 'height',        label: 'Hgt',          width: 65,  required: false },
  { key: 'note',          label: 'Note',         width: 120, required: false },
];

const CARRIERS = [
  { name: 'USPS',  accentColor: '#1D4ED8', selectedBg: '#EFF6FF', selectedBorder: '#1D4ED8', badgeClass: 'usps' },
  { name: 'UPS',   accentColor: '#92400E', selectedBg: '#FFFBEB', selectedBorder: '#92400E', badgeClass: 'ups'  },
  { name: 'FedEx', accentColor: '#5B21B6', selectedBg: '#F5F3FF', selectedBorder: '#5B21B6', badgeClass: 'fedex'},
  { name: 'DHL',   accentColor: '#B45309', selectedBg: '#FEF3C7', selectedBorder: '#B45309', badgeClass: 'dhl'  },
];

// ── Carrier PNG Logos ─────────────────────────────────────────
const CARRIER_LOGOS: Record<string, string> = {
  USPS:  uspsLogo,
  UPS:   upsLogo,
  FedEx: fedexLogo,
  DHL:   dhlLogo,
};

const CarrierLogo = ({ name }: { name: string }) => {
  const src = CARRIER_LOGOS[name];
  if (!src) return null;
  return (
    <div style={{ width: 52, height: 28, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <img
        src={src}
        alt={name}
        style={{ width: 80, height: 48, objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
};

// ── CSV helpers ───────────────────────────────────────────────
const SAMPLE_ROWS: Record<string, string[][]> = {
  USPS:  [['John Doe','Acme Corp','555-1234','123 Main St','Suite 100','New York','NY','10001','Jane Smith','','','456 Oak Ave','','Los Angeles','CA','90001','16','12','10','8','Fragile']],
  UPS:   [['John Doe','','555-9876','789 Elm Rd','','Chicago','IL','60601','Bob Lee','','','321 Pine St','','Houston','TX','77001','20','','','','']],
  FedEx: [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
  DHL:   [['Alice Brown','Corp LLC','','555 Maple Dr','','Seattle','WA','98101','Tom Green','','','99 River Rd','','Miami','FL','33101','10','','','','']],
};

function buildSampleCSV(carrier: string): string {
  const header = ALL_COLS.join(',');
  const rows   = (SAMPLE_ROWS[carrier] || SAMPLE_ROWS.USPS)
    .map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  return [header, ...rows].join('\n');
}

function downloadTemplate(carrier: string) {
  const csv  = buildSampleCSV(carrier);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${carrier}_bulk_template.csv`; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): { headers: string[]; rows: LabelRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
  const rows    = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    const obj: LabelRow = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row: LabelRow): string[] {
  const errs: string[] = [];
  for (const col of REQUIRED_COLS) {
    if (!row[col]?.trim()) errs.push(`${col.replace(/_/g,' ')} required`);
  }
  if (row.weight && isNaN(parseFloat(row.weight))) errs.push('weight must be a number');
  return errs;
}

function emptyRow(): LabelRow {
  const row: LabelRow = {};
  ALL_COLS.forEach(c => { row[c] = ''; });
  return row;
}

// ── Main component ────────────────────────────────────────────
const BulkLabelGenerator: React.FC = () => {
  const navigate = useNavigate();

  const [accessList,      setAccessList]      = useState<AccessItem[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState('');
  const [selectedVendor,  setSelectedVendor]  = useState<AccessItem | null>(null);
  const [fileName,        setFileName]        = useState('');
  const [rows,            setRows]            = useState<LabelRow[]>([]);
  const [rowErrors,       setRowErrors]       = useState<Record<number, string[]>>({});
  const [headerMissing,   setHeaderMissing]   = useState<string[]>([]);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [apiResult,       setApiResult]       = useState<ApiResult | null>(null);
  const [manifestResult,  setManifestResult]  = useState<ManifestResult | null>(null);
  const [genError,        setGenError]        = useState('');
  const [isDragging,      setIsDragging]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    axios.get('/access/me').then(r => setAccessList(r.data.access || [])).catch(console.error);
  }, []);

  const vendorsForCarrier = accessList.filter(a => a.carrier === selectedCarrier && a.isAllowed);

  const getEffectiveRate = useCallback((weight: number) => {
    if (!selectedVendor) return 0;
    if (!selectedVendor.rateTiers?.length) return selectedVendor.baseRate;
    const tier = selectedVendor.rateTiers.find(t =>
      weight >= t.minLbs && (t.maxLbs === null || weight <= t.maxLbs)
    );
    return tier?.rate ?? selectedVendor.baseRate;
  }, [selectedVendor]);

  const totalCost  = rows.reduce((sum, r) => sum + getEffectiveRate(parseFloat(r.weight) || 0), 0);
  const hasErrors  = Object.keys(rowErrors).length > 0 || headerMissing.length > 0;
  const hasRateTiers = !!selectedVendor?.rateTiers?.length;
  const carrier    = CARRIERS.find(c => c.name === selectedCarrier);

  // Total savings vs USPS retail (Zone 1) — only for USPS non-manifest
  const totalSavings = useMemo(() => {
    if (selectedCarrier !== 'USPS' || selectedVendor?.vendorType === 'manifest') return 0;
    return rows.reduce((sum, r) => {
      const w = parseFloat(r.weight) || 0;
      if (w <= 0) return sum;
      const retail = getUspsZone1Rate(w);
      if (retail === null) return sum;
      const saving = retail - getEffectiveRate(w);
      return sum + (saving > 0 ? saving : 0);
    }, 0);
  }, [rows, selectedCarrier, selectedVendor, getEffectiveRate]);

  // ── Row editing ──────────────────────────────────────────────
  const revalidateRows = useCallback((newRows: LabelRow[]) => {
    const errors: Record<number, string[]> = {};
    newRows.forEach((row, i) => {
      const e = validateRow(row);
      if (e.length) errors[i] = e;
    });
    setRowErrors(errors);
    return errors;
  }, []);

  const updateCell = (rowIdx: number, col: string, val: string) => {
    const newRows = rows.map((r, i) => i === rowIdx ? { ...r, [col]: val } : r);
    setRows(newRows);
    revalidateRows(newRows);
  };

  const deleteRow = (rowIdx: number) => {
    const newRows = rows.filter((_, i) => i !== rowIdx);
    setRows(newRows);
    revalidateRows(newRows);
  };

  const addRow = () => {
    const newRows = [...rows, emptyRow()];
    setRows(newRows);
    revalidateRows(newRows);
  };

  // ── CSV processing ───────────────────────────────────────────
  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { setHeaderMissing(['Please upload a .csv file']); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows: parsedRows } = parseCSV(text);
      const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
      setHeaderMissing(missing);
      if (missing.length === 0) {
        setRows(parsedRows);
        revalidateRows(parsedRows);
      } else {
        setRows([]);
      }
    };
    reader.readAsText(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const clearFile = () => {
    setFileName(''); setRows([]); setRowErrors({}); setHeaderMissing([]);
  };

  // ── Generate ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedVendor || hasErrors || rows.length === 0) return;
    setIsGenerating(true); setGenError('');
    try {
      const res = await axios.post('/labels/bulk', { vendorId: selectedVendor.vendorId, labels: rows });
      if (res.data.type === 'manifest') {
        setManifestResult(res.data as ManifestResult);
      } else {
        setApiResult(res.data as ApiResult);
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        setGenError(data.errors.map((e: any) => e.msg).join(' · '));
      } else {
        setGenError(data?.message || 'Failed to generate labels');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setSelectedCarrier(''); setSelectedVendor(null); setFileName('');
    setRows([]); setRowErrors({}); setHeaderMissing([]);
    setApiResult(null); setManifestResult(null); setGenError('');
  };

  // ══════════════════════════════════════════════════════════════
  // RESULT SCREEN — Manifest
  // ══════════════════════════════════════════════════════════════
  if (manifestResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Job Submitted</h1>
          <p className="page-subtitle">Your manifest job has been broadcast to available vendors.</p>
        </div>
      </div>

      <div className="sh-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center', borderTop: '4px solid var(--accent-500)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-50)', border: '2px solid var(--accent-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClockIcon style={{ width: 32, height: 32, color: 'var(--accent-600)' }} />
        </div>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: 6 }}>Waiting for a vendor to accept</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>
            Your request has been sent to all {manifestResult.carrier} manifest vendors. A vendor will claim it shortly.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%', maxWidth: 480 }}>
          {[
            { val: manifestResult.labelCount, label: 'Labels', color: 'var(--navy-900)' },
            { val: `$${manifestResult.totalCost.toFixed(2)}`, label: 'Charged', color: 'var(--danger-600)' },
            { val: `$${manifestResult.newBalance.toFixed(2)}`, label: 'Balance', color: 'var(--accent-600)' },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ padding: '0.875rem', background: 'var(--navy-50)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--navy-50)', borderRadius: 8, padding: '0.75rem 1.25rem', display: 'flex', gap: 10, width: '100%', maxWidth: 480 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Job ID</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--navy-700)', wordBreak: 'break-all' }}>{manifestResult.manifestJobId}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-ghost" onClick={reset}>Submit Another Batch</button>
        <button className="btn btn-primary" onClick={reset}>
          <ClipboardDocumentListIcon style={{ width: 16, height: 16 }} /> Submit Another
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // RESULT SCREEN — API
  // ══════════════════════════════════════════════════════════════
  if (apiResult) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={reset} className="btn btn-ghost btn-sm" style={{ padding: '0.375rem' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Bulk Generation Complete</h1>
          <p className="page-subtitle">
            {apiResult.results.filter(r => r.success).length} succeeded · {apiResult.results.filter(r => !r.success).length} failed
          </p>
        </div>
      </div>

      {(() => {
        const successSavings = selectedCarrier === 'USPS' && selectedVendor?.vendorType !== 'manifest'
          ? apiResult.results.reduce((sum, r, i) => {
              if (!r.success) return sum;
              const w = parseFloat(rows[i]?.weight) || 0;
              const retail = getUspsZone1Rate(w);
              if (!retail) return sum;
              const saving = retail - getEffectiveRate(w);
              return sum + (saving > 0 ? saving : 0);
            }, 0)
          : 0;
        const cards = [
          { val: apiResult.results.filter(r => r.success).length,  label: 'Generated', color: 'var(--success-600)' },
          { val: apiResult.results.filter(r => !r.success).length, label: 'Failed',    color: apiResult.results.filter(r => !r.success).length > 0 ? 'var(--danger-600)' : 'var(--navy-500)' },
          { val: `$${apiResult.newBalance.toFixed(2)}`,            label: 'Remaining', color: 'var(--accent-600)' },
          ...(successSavings > 0 ? [{ val: `$${successSavings.toFixed(2)}`, label: 'Saved vs USPS', color: '#059669' }] : []),
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: '1rem' }}>
            {cards.map(({ val, label, color }) => (
              <div key={label} className="sh-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                {label === 'Saved vs USPS' && <SparklesIcon style={{ width: 18, height: 18, color: '#059669', margin: '0 auto 4px' }} />}
                <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{val}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--navy-500)', marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="sh-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sh-table">
            <thead>
              <tr>
                <th>#</th><th>To Name</th><th>Tracking ID</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {apiResult.results.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--navy-500)', fontSize: '0.8rem' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{rows[i]?.to_name || '—'}</td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.trackingId || '—'}</span></td>
                  <td>
                    {r.success
                      ? <span className="badge badge-green"><CheckCircleIcon style={{ width: 11, height: 11 }} />Generated</span>
                      : <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 11, height: 11 }} />{r.error || 'Failed'}</span>
                    }
                  </td>
                  <td>
                    {r.pdfUrl && (
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        window.open(r.pdfUrl!, '_blank');
                      }}>
                        <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={reset}>Generate Another Batch</button>
        {apiResult.zipUrl && (
          <button className="btn btn-primary" onClick={async () => {
            try {
              const res = await axios.get(apiResult.zipUrl!, { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a');
              a.href = url; a.download = 'bulk-labels.zip';
              document.body.appendChild(a); a.click(); a.remove();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              alert('Failed to download ZIP. Please try again.');
            }
          }}>
            <ArrowDownTrayIcon style={{ width: 16, height: 16 }} />
            Download All Labels (ZIP)
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => navigate('/labels/history')}>View History</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // MAIN COMPACT VIEW
  // ══════════════════════════════════════════════════════════════
  const validRowCount = rows.length - Object.keys(rowErrors).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingBottom: rows.length > 0 && selectedVendor ? 80 : 0 }} className="animate-fadeIn">

      {/* ══════════════════════════════════════════════════════
          COMBINED SERVICE CARD — Carrier · Vendor · Upload
      ══════════════════════════════════════════════════════ */}
      <div className="sh-card" style={{ overflow: 'hidden' }}>

        {/* Row 1 — Carrier pills + vendor dropdown + template */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--navy-100)' }}>
          {/* Carrier pills with logos */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {CARRIERS.map(c => {
              const allowed    = accessList.filter(a => a.carrier === c.name && a.isAllowed);
              const isEnabled  = allowed.length > 0;
              const isSelected = selectedCarrier === c.name;
              return (
                <div
                  key={c.name}
                  onClick={() => {
                    if (!isEnabled) return;
                    if (isSelected) { setSelectedCarrier(''); setSelectedVendor(null); clearFile(); return; }
                    setSelectedCarrier(c.name); setSelectedVendor(null); clearFile();
                  }}
                  title={isEnabled ? `${c.name} · ${allowed.length} vendor${allowed.length !== 1 ? 's' : ''}` : 'No access'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 46, minWidth: 80, padding: '4px 12px',
                    borderRadius: 10,
                    border: isSelected ? `2px solid ${c.accentColor}` : '1.5px solid #e2e8f0',
                    background: isSelected ? c.selectedBg : '#fff',
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                    opacity: isEnabled ? 1 : 0.35,
                    boxShadow: isSelected ? `0 0 0 3px ${c.accentColor}18, 0 2px 8px ${c.accentColor}20` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <CarrierLogo name={c.name} />
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 34, background: 'var(--navy-100)', flexShrink: 0 }} />

          {/* Vendor dropdown */}
          <div style={{ flex: 1, minWidth: 200, maxWidth: 340, position: 'relative' }}>
            <select
              className="form-input form-select"
              value={selectedVendor?.vendorId || ''}
              disabled={!selectedCarrier || vendorsForCarrier.length === 0}
              onChange={e => {
                const v = vendorsForCarrier.find(x => x.vendorId === e.target.value) || null;
                setSelectedVendor(v); clearFile();
              }}
              style={{ padding: '0.45rem 2rem 0.45rem 0.75rem', fontSize: '0.82rem', cursor: selectedCarrier ? 'pointer' : 'not-allowed' }}
            >
              <option value="">
                {!selectedCarrier ? '← pick a carrier' : vendorsForCarrier.length === 0 ? 'No vendors — contact admin' : '— select vendor —'}
              </option>
              {vendorsForCarrier.map(v => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor badges */}
          {selectedVendor && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
              {selectedVendor.shippingService && <span className="badge badge-blue">{selectedVendor.shippingService}</span>}
              {selectedVendor.vendorType === 'manifest'
                ? <span className="badge badge-amber">Manifested</span>
                : <span className="badge badge-green">Auto</span>
              }
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Template download */}
          {selectedCarrier && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', flexShrink: 0 }}
              onClick={() => downloadTemplate(selectedCarrier)}
            >
              <ArrowDownTrayIcon style={{ width: 13, height: 13 }} /> Template
            </button>
          )}
        </div>

        {/* Row 2 — File upload / status */}
        <div style={{ padding: '0.625rem 1rem' }}>
          {fileName ? (
            /* File loaded bar */
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DocumentTextIcon style={{ width: 15, height: 15, color: 'var(--accent-500)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--navy-800)', fontSize: '0.82rem' }}>{fileName}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} rows</span>
              {headerMissing.length === 0 && Object.keys(rowErrors).length === 0 && rows.length > 0 && (
                <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />Valid</span>
              )}
              {(headerMissing.length > 0 || Object.keys(rowErrors).length > 0) && (
                <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />
                  {headerMissing.length > 0 ? 'Bad columns' : `${Object.keys(rowErrors).length} row errors`}
                </span>
              )}
              {headerMissing.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--danger-600)' }}>
                  Missing: {headerMissing.join(', ')} —{' '}
                  <button style={{ background: 'none', border: 'none', color: 'var(--accent-600)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
                    onClick={() => downloadTemplate(selectedCarrier)}>get template</button>
                </span>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '0.2rem 0.5rem' }} onClick={clearFile}>
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ) : (
            /* Drop zone — slim */
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                border: isDragging ? '2px dashed var(--accent-400)' : '2px dashed var(--navy-200)',
                borderRadius: 9, padding: '0.55rem 0.875rem',
                background: isDragging ? 'var(--accent-50)' : 'var(--navy-50)',
                cursor: selectedVendor ? 'pointer' : 'not-allowed',
                opacity: selectedVendor ? 1 : 0.5,
                transition: 'all 0.15s',
              }}
              onDragOver={e => { if (!selectedVendor) return; e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { if (!selectedVendor) return; handleFileDrop(e); }}
              onClick={() => { if (!selectedVendor) return; fileRef.current?.click(); }}
            >
              <ArrowUpTrayIcon style={{ width: 16, height: 16, color: isDragging ? 'var(--accent-500)' : 'var(--navy-500)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 500, color: isDragging ? 'var(--accent-700)' : 'var(--navy-600)' }}>
                {!selectedVendor ? 'Select a vendor above to upload CSV' : isDragging ? 'Drop it!' : 'Drop CSV here or click to browse'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginLeft: 4 }}>.csv only</span>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          DATA TABLE — editable rows
      ══════════════════════════════════════════════════════ */}
      {rows.length > 0 && headerMissing.length === 0 && (
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          {/* Table toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.625rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--navy-600)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Review & Edit
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--navy-500)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
            {Object.keys(rowErrors).length > 0
              ? <span className="badge badge-red"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(rowErrors).length} error{Object.keys(rowErrors).length !== 1 ? 's' : ''}</span>
              : <span className="badge badge-green"><CheckCircleIcon style={{ width: 10, height: 10 }} />All valid</span>
            }
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={addRow}>
              <PlusIcon style={{ width: 13, height: 13 }} /> Add Row
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--navy-50)', borderBottom: '1px solid var(--navy-100)' }}>
                  <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: 32 }}>#</th>
                  {TABLE_COLS.map(col => (
                    <th key={col.key} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', fontWeight: 700, color: 'var(--navy-600)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: col.width }}>
                      {col.label}{col.required && <span style={{ color: 'var(--danger-400)', marginLeft: 2 }}>*</span>}
                    </th>
                  ))}
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const errs = rowErrors[rowIdx] || [];
                  const hasRowError = errs.length > 0;
                  return (
                    <tr key={rowIdx} style={{ borderBottom: '1px solid var(--navy-50)', background: hasRowError ? 'rgba(239,68,68,0.025)' : 'transparent' }}>
                      <td style={{ padding: '0.25rem 0.5rem', color: 'var(--navy-500)', fontWeight: 600, fontSize: '0.75rem', verticalAlign: 'middle' }}>
                        {hasRowError
                          ? <ExclamationCircleIcon style={{ width: 13, height: 13, color: 'var(--danger-400)' }} title={errs.join(', ')} />
                          : rowIdx + 1}
                      </td>
                      {TABLE_COLS.map(col => {
                        const isEmpty      = col.required && !row[col.key]?.trim();
                        const isWeightErr  = col.key === 'weight' && row[col.key] && isNaN(parseFloat(row[col.key]));
                        const cellError    = isEmpty || isWeightErr;
                        return (
                          <td key={col.key} style={{ padding: '0.2rem 0.25rem', verticalAlign: 'middle' }}>
                            <input
                              value={row[col.key] || ''}
                              onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                              placeholder={col.key}
                              style={{
                                width: col.width, padding: '0.28rem 0.45rem',
                                border: cellError ? '1.5px solid var(--danger-400)' : '1.5px solid var(--navy-200)',
                                borderRadius: 6, fontSize: '0.8rem',
                                fontFamily: 'var(--font-sans)', color: 'var(--navy-900)',
                                background: cellError ? 'rgba(239,68,68,0.04)' : '#fff',
                                outline: 'none', transition: 'border-color 0.15s',
                              }}
                              onFocus={e => { if (!cellError) e.target.style.borderColor = 'var(--accent-400)'; }}
                              onBlur={e => { e.target.style.borderColor = cellError ? 'var(--danger-400)' : 'var(--navy-200)'; }}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: '0.2rem 0.4rem', verticalAlign: 'middle' }}>
                        <button
                          onClick={() => deleteRow(rowIdx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: 3, borderRadius: 5, display: 'flex', transition: 'color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger-500)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--navy-300)')}
                        >
                          <TrashIcon style={{ width: 13, height: 13 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--navy-50)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={addRow}>
              <PlusIcon style={{ width: 12, height: 12 }} /> Add Row
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>Click any cell to edit · red = required field missing</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STICKY FOOTER — Cost summary + Generate
      ══════════════════════════════════════════════════════ */}
      {rows.length > 0 && selectedVendor && headerMissing.length === 0 && (
        <div
          className="bulk-sticky-footer"
          style={{
            position: 'fixed', bottom: 0,
            left: 'var(--sidebar-w, 256px)', right: 0,
            background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(10px)',
            borderTop: '1px solid var(--navy-100)', boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
            padding: '0.75rem 1.5rem', zIndex: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {carrier && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: carrier.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TruckIcon style={{ width: 12, height: 12, color: '#fff' }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)' }}>{selectedCarrier}</span>
              </div>
            )}
            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>{selectedVendor.vendorName}</span>
            <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}>
                <strong style={{ color: 'var(--navy-900)' }}>{rows.length}</strong> label{rows.length !== 1 ? 's' : ''}
              </span>
              {!hasRateTiers && <>
                <span style={{ color: 'var(--navy-300)' }}>×</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--navy-600)' }}><strong>${selectedVendor.baseRate.toFixed(2)}</strong>/ea</span>
              </>}
              <span style={{ color: 'var(--navy-300)' }}>=</span>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent-600)' }}>${totalCost.toFixed(2)}</span>
            </div>
            {totalSavings > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: 'var(--navy-300)', fontSize: '0.8rem' }}>·</span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: '#ecfdf5', color: '#065f46',
                  border: '1px solid #6ee7b7',
                  padding: '2px 10px', borderRadius: 20,
                  fontSize: '0.78rem', fontWeight: 700,
                }}>
                  <SparklesIcon style={{ width: 11, height: 11 }} />
                  Save ${totalSavings.toFixed(2)} vs USPS retail
                </span>
              </div>
            )}
            {validRowCount !== rows.length && (
              <span className="badge badge-amber"><ExclamationCircleIcon style={{ width: 10, height: 10 }} />{Object.keys(rowErrors).length} row error{Object.keys(rowErrors).length !== 1 ? 's' : ''}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {genError && <span style={{ fontSize: '0.8rem', color: 'var(--danger-600)', maxWidth: 260 }}>{genError}</span>}
            <button
              className="btn btn-primary"
              disabled={hasErrors || isGenerating || rows.length === 0}
              onClick={handleGenerate}
              style={{ minWidth: 190, padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}
            >
              {isGenerating
                ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Processing…</>
                : selectedVendor.vendorType === 'manifest'
                  ? <><ClipboardDocumentListIcon style={{ width: 15, height: 15 }} />Submit Manifest Job</>
                  : <><TruckIcon style={{ width: 15, height: 15 }} />Generate {rows.length} Label{rows.length !== 1 ? 's' : ''}</>
              }
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .bulk-sticky-footer { left: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default BulkLabelGenerator;
