import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  TruckIcon, CheckCircleIcon, ExclamationCircleIcon,
  ArrowDownTrayIcon, XMarkIcon, ArrowsRightLeftIcon,
  BuildingOfficeIcon, PlusIcon, TrashIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import uspsLogo  from '../Logos/United_States_Postal_Service-Logo.wine.png';
import upsLogo   from '../Logos/United_Parcel_Service-Logo.wine.png';
import fedexLogo from '../Logos/FedEx_Express-Logo.wine.png';
import dhlLogo   from '../Logos/DHL-Logo.wine.png';

// ── Types ─────────────────────────────────────────────────────
interface AccessItem {
  vendorId: string; vendorName: string; carrier: string;
  vendorType: 'api' | 'manifest'; shippingService: string;
  baseRate: number; isAllowed: boolean;
  rateTiers: Array<{ minLbs: number; maxLbs: number | null; rate: number }>;
}

interface Warehouse {
  id: string;
  label: string;
  name: string; company: string; phone: string;
  address1: string; address2: string;
  city: string; state: string; zip: string;
}

// ── Constants ─────────────────────────────────────────────────
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const CARRIERS  = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

const CARRIER_CFG: Record<string, { solid: string; light: string; border: string; logo: string }> = {
  USPS:  { solid: '#1D4ED8', light: '#EFF6FF', border: '#BFDBFE', logo: uspsLogo  },
  UPS:   { solid: '#92400E', light: '#FFFBEB', border: '#FDE68A', logo: upsLogo   },
  FedEx: { solid: '#6D28D9', light: '#F5F3FF', border: '#DDD6FE', logo: fedexLogo },
  DHL:   { solid: '#B45309', light: '#FEF3C7', border: '#FDE68A', logo: dhlLogo   },
};

const BLANK_FORM = {
  from_name: '', from_company: '', from_phone: '',
  from_address1: '', from_address2: '', from_city: '', from_state: 'NY', from_zip: '', from_country: 'USA',
  to_name: '', to_company: '', to_phone: '',
  to_address1: '', to_address2: '', to_city: '', to_state: 'NJ', to_zip: '', to_country: 'USA',
  weight: '', length: '', width: '', height: '', note: '',
};

const WH_KEY = 'shipme_warehouses';
const loadWarehouses  = (): Warehouse[]                => { try { return JSON.parse(localStorage.getItem(WH_KEY) || '[]'); } catch { return []; } };
const saveWarehouses  = (wh: Warehouse[]) => localStorage.setItem(WH_KEY, JSON.stringify(wh));

// ── Field label style (shared) ────────────────────────────────
const fieldLabel: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 600,
  color: 'var(--navy-500)',               // darker than before — readable
  letterSpacing: '0.03em',
  marginBottom: 3,
};

// ── Compact field ─────────────────────────────────────────────
const F: React.FC<{
  label: string; name: string; value: string; required?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  type?: string; step?: string; min?: string; placeholder?: string;
  style?: React.CSSProperties;
}> = ({ label, name, value, required, onChange, type = 'text', step, min, placeholder, style }) => (
  <div style={style}>
    <div style={fieldLabel}>
      {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </div>
    <input
      name={name} type={type} step={step} min={min}
      required={required} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '0.35rem 0.5rem', fontSize: '0.82rem',
        border: '1px solid var(--navy-200)', borderRadius: 5,
        background: '#fff', color: 'var(--navy-900)',
        outline: 'none', transition: 'border-color 0.15s',
        fontFamily: 'inherit', lineHeight: 1.4, fontWeight: 400,
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--accent-400)')}
      onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
    />
  </div>
);

const StateSelect: React.FC<{ name: string; value: string; onChange: React.ChangeEventHandler<HTMLSelectElement>; style?: React.CSSProperties }> = ({ name, value, onChange, style }) => (
  <div style={style}>
    <div style={fieldLabel}>
      State<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
    </div>
    <select name={name} value={value} onChange={onChange} required
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '0.35rem 0.4rem', fontSize: '0.82rem',
        border: '1px solid var(--navy-200)', borderRadius: 5,
        background: '#fff', color: 'var(--navy-900)',
        outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
);

// ── Main component ────────────────────────────────────────────
const LabelGenerator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill  = (location.state as any)?.prefill;

  const [accessList,       setAccessList]       = useState<AccessItem[]>([]);
  const [selectedCarrier,  setSelectedCarrier]  = useState<string>(prefill?.carrier ?? '');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [showManifestModal,setShowManifestModal] = useState(false);
  const [isLoading,        setIsLoading]        = useState(false);
  const [successData,      setSuccessData]      = useState<{ tracking: string; charged: string; balance: string } | null>(null);
  const [error,            setError]            = useState('');
  const [isReturn,         setIsReturn]         = useState(!!prefill);
  const [form,             setForm]             = useState(prefill ? { ...BLANK_FORM, ...prefill } : BLANK_FORM);

  // Warehouse state
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>(loadWarehouses);
  const [showWhPanel,  setShowWhPanel]  = useState(false);
  const [newWhLabel,   setNewWhLabel]   = useState('');
  const whPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    axios.get('/access/me').then(res => {
      const list = res.data.access || [];
      setAccessList(list);
      if (prefill?.vendorId) {
        const match = list.find((a: AccessItem) => a.vendorId === prefill.vendorId && a.isAllowed);
        if (match) setSelectedVendorId(match.vendorId);
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close warehouse panel on outside click
  useEffect(() => {
    if (!showWhPanel) return;
    const handler = (e: MouseEvent) => {
      if (whPanelRef.current && !whPanelRef.current.contains(e.target as Node)) {
        setShowWhPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showWhPanel]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f: typeof BLANK_FORM) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleCarrierSelect = (carrier: string) => {
    setSelectedCarrier(carrier);
    setSelectedVendorId('');
    setError('');
    setSuccessData(null);
  };

  const carrierVendors = accessList.filter(a => a.carrier === selectedCarrier && a.isAllowed);

  const handleVendorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vid = e.target.value;
    if (!vid) { setSelectedVendorId(''); return; }
    const item = accessList.find(a => a.vendorId === vid);
    if (item?.vendorType === 'manifest') { setShowManifestModal(true); return; }
    setSelectedVendorId(vid);
    setError('');
  };

  const selectedAccess = accessList.find(a => a.vendorId === selectedVendorId);
  const weight         = parseFloat(form.weight) || 0;

  const getEffectiveRate = (w: number): number => {
    if (!selectedAccess) return 0;
    if (!selectedAccess.rateTiers?.length) return selectedAccess.baseRate;
    const tier = selectedAccess.rateTiers.find(t => w >= t.minLbs && (t.maxLbs === null || w <= t.maxLbs));
    return tier?.rate ?? selectedAccess.baseRate;
  };

  const effectiveRate = getEffectiveRate(weight);
  const canSubmit     = !!selectedVendorId && !isLoading;
  const activeCfg     = selectedCarrier ? CARRIER_CFG[selectedCarrier] : null;

  // Swap FROM ↔ TO
  const fromFilled = !!(form.from_name.trim() && form.from_address1.trim() && form.from_city.trim());
  const toFilled   = !!(form.to_name.trim()   && form.to_address1.trim()   && form.to_city.trim());
  const canSwap    = fromFilled && toFilled;

  const handleSwap = () => {
    if (!canSwap) return;
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: f.to_name, from_company: f.to_company, from_phone: f.to_phone,
      from_address1: f.to_address1, from_address2: f.to_address2,
      from_city: f.to_city, from_state: f.to_state, from_zip: f.to_zip,
      from_country: f.to_country,
      to_name: f.from_name, to_company: f.from_company, to_phone: f.from_phone,
      to_address1: f.from_address1, to_address2: f.from_address2,
      to_city: f.from_city, to_state: f.from_state, to_zip: f.from_zip,
      to_country: f.from_country,
    }));
  };

  // Warehouse helpers
  const loadWarehouse = (wh: Warehouse) => {
    setForm((f: typeof BLANK_FORM) => ({
      ...f,
      from_name: wh.name, from_company: wh.company, from_phone: wh.phone,
      from_address1: wh.address1, from_address2: wh.address2,
      from_city: wh.city, from_state: wh.state, from_zip: wh.zip,
    }));
    setShowWhPanel(false);
  };

  const saveWarehouse = () => {
    const label = newWhLabel.trim() || `Warehouse ${warehouses.length + 1}`;
    const wh: Warehouse = {
      id: Date.now().toString(),
      label,
      name:     form.from_name,    company: form.from_company,
      phone:    form.from_phone,   address1: form.from_address1,
      address2: form.from_address2, city: form.from_city,
      state:    form.from_state,   zip: form.from_zip,
    };
    const updated = [...warehouses, wh];
    setWarehouses(updated);
    saveWarehouses(updated);
    setNewWhLabel('');
  };

  const deleteWarehouse = (id: string) => {
    const updated = warehouses.filter(w => w.id !== id);
    setWarehouses(updated);
    saveWarehouses(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId) { setError('Select a carrier and vendor first.'); return; }
    setIsLoading(true); setError(''); setSuccessData(null);
    try {
      const res = await axios.post('/labels/single', { vendorId: selectedVendorId, ...form });
      const pdfUrl = res.data.label?.pdfUrl;
      if (pdfUrl) {
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `label-${res.data.label?.trackingId || Date.now()}.pdf`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }
      setSuccessData({
        tracking: res.data.label?.trackingId || 'N/A',
        charged:  (res.data.label?.price ?? 0).toFixed(2),
        balance:  (res.data.newBalance ?? 0).toFixed(2),
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate label');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Manifest modal */}
      {showManifestModal && (
        <div className="modal-overlay" onClick={() => setShowManifestModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.875rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--warning-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TruckIcon style={{ width: 18, height: 18, color: 'var(--warning-600)' }} />
              </div>
              <h3 className="modal-title" style={{ margin: 0 }}>Manifested Vendor</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--navy-600)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Single label generation is not available for manifested services. Use <strong>Bulk Labels</strong> to submit a manifest job.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowManifestModal(false)}>Dismiss</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/labels/bulk')}>Go to Bulk Labels</button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 920 }}>
        <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* ── Service bar ─────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap',
            padding: '0.5rem 0.875rem',
            background: activeCfg ? activeCfg.light : 'var(--navy-25)',
            borderBottom: `1px solid ${activeCfg ? activeCfg.border : 'var(--navy-150)'}`,
            transition: 'background 0.2s, border-color 0.2s',
          }}>

            {/* Carrier logo pills */}
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              {CARRIERS.map(c => {
                const cfg        = CARRIER_CFG[c];
                const isSelected = selectedCarrier === c;
                return (
                  <button
                    key={c} type="button"
                    onClick={() => handleCarrierSelect(c)}
                    title={c}
                    style={{
                      padding: '5px 16px', borderRadius: 9, height: 52,
                      border: `2px solid ${isSelected ? cfg.solid : 'var(--navy-200)'}`,
                      background: isSelected ? cfg.light : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isSelected
                        ? `0 0 0 3px ${cfg.solid}22, 0 2px 8px ${cfg.solid}30`
                        : '0 1px 3px rgba(0,0,0,0.06)',
                      outline: 'none',
                    }}
                  >
                    <img
                      src={cfg.logo} alt={c}
                      style={{
                        height: 34, width: 'auto', maxWidth: 96,
                        objectFit: 'contain',
                        // no filter — always render logo as-is on light background
                        transition: 'opacity 0.13s',
                        opacity: 1,
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 32, background: 'var(--navy-200)', flexShrink: 0 }} />

            {/* Vendor dropdown */}
            <select
              value={selectedVendorId}
              onChange={handleVendorChange}
              style={{
                flex: 1, minWidth: 160, maxWidth: 260,
                padding: '4px 8px', fontSize: '0.78rem', fontWeight: 500,
                border: '1px solid var(--navy-200)', borderRadius: 5,
                background: '#fff', color: selectedVendorId ? 'var(--navy-900)' : 'var(--navy-400)',
                outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <option value="">{selectedCarrier ? `— ${selectedCarrier} service —` : '— Pick carrier first —'}</option>
              {carrierVendors.map(v => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorName}{v.shippingService ? ` · ${v.shippingService}` : ''}{v.vendorType === 'manifest' ? ' (Manifest)' : ''}
                </option>
              ))}
            </select>

            {/* Price chip */}
            {selectedAccess && (
              <span style={{
                background: weight > 0 ? '#dcfce7' : 'var(--navy-100)',
                color:      weight > 0 ? '#15803d' : 'var(--navy-500)',
                border:     `1px solid ${weight > 0 ? '#bbf7d0' : 'var(--navy-200)'}`,
                padding: '2px 9px', borderRadius: 20,
                fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.2s', flexShrink: 0,
              }}>
                {weight > 0 ? `$${effectiveRate.toFixed(2)}` : `base $${selectedAccess.baseRate.toFixed(2)}`}
              </span>
            )}

            <div style={{ flex: 1 }} />

            {/* Return badge */}
            {isReturn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 7px', borderRadius: 10 }}>
                  ↩ Return
                </span>
                <button
                  type="button"
                  onClick={() => { setIsReturn(false); setForm(BLANK_FORM); setSelectedCarrier(''); setSelectedVendorId(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', fontSize: '0.7rem', padding: '2px 4px' }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* ── Address columns ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'relative' }}>

            {/* FROM */}
            <div style={{ padding: '0.75rem 0.875rem', borderRight: '1px solid var(--navy-100)' }}>

              {/* FROM header + warehouse button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', position: 'relative' }} ref={whPanelRef}>
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--navy-700)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>From</div>

                <button
                  type="button"
                  onClick={() => setShowWhPanel(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: showWhPanel ? 'var(--accent-50)' : 'none',
                    border: `1px solid ${showWhPanel ? 'var(--accent-200)' : 'var(--navy-200)'}`,
                    borderRadius: 5, padding: '2px 7px',
                    cursor: 'pointer', color: 'var(--navy-500)',
                    fontSize: '0.68rem', fontWeight: 600,
                    transition: 'all 0.12s',
                  }}
                >
                  <BuildingOfficeIcon style={{ width: 12, height: 12 }} />
                  Warehouses
                  <ChevronDownIcon style={{ width: 10, height: 10, transform: showWhPanel ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>

                {/* Warehouse panel */}
                {showWhPanel && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                    background: '#fff', border: '1px solid var(--navy-200)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    width: 280, padding: '0.625rem',
                  }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Saved Warehouses
                    </div>

                    {/* Warehouse list */}
                    {warehouses.length === 0 ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--navy-400)', padding: '0.375rem 0', marginBottom: '0.5rem' }}>
                        No warehouses saved yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: '0.625rem', maxHeight: 180, overflowY: 'auto' }}>
                        {warehouses.map(wh => (
                          <div key={wh.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'var(--navy-25)', border: '1px solid var(--navy-100)',
                            borderRadius: 6, padding: '0.375rem 0.5rem',
                          }}>
                            <BuildingOfficeIcon style={{ width: 13, height: 13, color: 'var(--accent-500)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wh.label}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--navy-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {wh.address1}, {wh.city}, {wh.state}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => loadWarehouse(wh)}
                              style={{ background: 'var(--accent-600)', border: 'none', borderRadius: 4, padding: '2px 7px', fontSize: '0.65rem', fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 }}
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWarehouse(wh.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-300)', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            >
                              <TrashIcon style={{ width: 12, height: 12 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save current FROM */}
                    <div style={{ borderTop: '1px solid var(--navy-100)', paddingTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Save current FROM</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          type="text"
                          value={newWhLabel}
                          onChange={e => setNewWhLabel(e.target.value)}
                          placeholder="e.g. NYC Warehouse"
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveWarehouse())}
                          style={{
                            flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.75rem',
                            border: '1px solid var(--navy-200)', borderRadius: 5,
                            outline: 'none', fontFamily: 'inherit',
                          }}
                        />
                        <button
                          type="button"
                          onClick={saveWarehouse}
                          disabled={!form.from_name.trim() && !form.from_address1.trim()}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '0.3rem 0.625rem', borderRadius: 5, border: 'none',
                            background: 'var(--accent-600)', color: '#fff',
                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <PlusIcon style={{ width: 11, height: 11 }} /> Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* FROM fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                <F label="Name"      name="from_name"     value={form.from_name}     onChange={handleChange} required />
                <F label="Company"   name="from_company"  value={form.from_company}  onChange={handleChange} />
                <F label="Address"   name="from_address1" value={form.from_address1} onChange={handleChange} required style={{ gridColumn: 'span 2' }} />
                <F label="Apt/Suite" name="from_address2" value={form.from_address2} onChange={handleChange} />
                <F label="Phone"     name="from_phone"    value={form.from_phone}    onChange={handleChange} />
                <F label="City"      name="from_city"     value={form.from_city}     onChange={handleChange} required />
                <StateSelect name="from_state" value={form.from_state} onChange={handleChange as any} />
                <F label="ZIP"       name="from_zip"      value={form.from_zip}      onChange={handleChange} required />
              </div>
            </div>

            {/* ── Swap button (centered on divider) ─────────────── */}
            <button
              type="button"
              onClick={handleSwap}
              disabled={!canSwap}
              title={canSwap ? 'Swap FROM ↔ TO' : 'Fill both addresses to swap'}
              style={{
                position: 'absolute',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 28, height: 28, borderRadius: '50%',
                background: canSwap ? 'var(--accent-600)' : '#e2e8f0',
                border: '2.5px solid #fff',
                cursor: canSwap ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2,
                boxShadow: canSwap ? '0 2px 8px rgba(99,102,241,0.35)' : '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.18s',
                outline: 'none',
              }}
            >
              <ArrowsRightLeftIcon style={{ width: 13, height: 13, color: canSwap ? '#fff' : '#94a3b8' }} />
            </button>

            {/* TO */}
            <div style={{ padding: '0.75rem 0.875rem' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--navy-700)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>To</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                <F label="Name"      name="to_name"     value={form.to_name}     onChange={handleChange} required />
                <F label="Company"   name="to_company"  value={form.to_company}  onChange={handleChange} />
                <F label="Address"   name="to_address1" value={form.to_address1} onChange={handleChange} required style={{ gridColumn: 'span 2' }} />
                <F label="Apt/Suite" name="to_address2" value={form.to_address2} onChange={handleChange} />
                <F label="Phone"     name="to_phone"    value={form.to_phone}    onChange={handleChange} />
                <F label="City"      name="to_city"     value={form.to_city}     onChange={handleChange} required />
                <StateSelect name="to_state" value={form.to_state} onChange={handleChange as any} />
                <F label="ZIP"       name="to_zip"      value={form.to_zip}      onChange={handleChange} required />
              </div>
            </div>
          </div>

          {/* ── Package + submit ────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap',
            padding: '0.55rem 0.875rem',
            background: 'var(--navy-25)',
            borderTop: '1px solid var(--navy-150)',
          }}>
            {([
              { label: 'Weight (lbs)', name: 'weight', required: true,  w: 104 },
              { label: 'Length (in)',  name: 'length', required: false, w: 84  },
              { label: 'Width (in)',   name: 'width',  required: false, w: 84  },
              { label: 'Height (in)', name: 'height', required: false, w: 84  },
            ] as const).map(f => (
              <F
                key={f.name} label={f.label} name={f.name}
                value={(form as any)[f.name]} onChange={handleChange}
                type="number" step="0.1" min="0"
                required={f.required}
                style={{ width: f.w, flexShrink: 0 }}
              />
            ))}

            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={fieldLabel}>Note</div>
              <input
                name="note" type="text" value={form.note}
                onChange={handleChange as any} placeholder="Optional…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '0.32rem 0.5rem', fontSize: '0.8rem',
                  border: '1px solid var(--navy-200)', borderRadius: 5,
                  background: '#fff', color: 'var(--navy-900)',
                  outline: 'none', fontFamily: 'inherit',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent-400)')}
                onBlur={e  => (e.target.style.borderColor = 'var(--navy-200)')}
              />
            </div>

            <button
              type="submit" disabled={!canSubmit}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.38rem 1.1rem', borderRadius: 6, border: 'none',
                background: canSubmit ? (activeCfg ? activeCfg.solid : 'var(--accent-600)') : 'var(--navy-200)',
                color: canSubmit ? '#fff' : 'var(--navy-400)',
                fontSize: '0.8rem', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap', transition: 'background 0.15s',
                boxShadow: canSubmit ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                flexShrink: 0, alignSelf: 'flex-end',
              }}
            >
              {isLoading
                ? <><div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Generating…</>
                : <><ArrowDownTrayIcon style={{ width: 14, height: 14 }} />{weight > 0 && selectedVendorId ? ` Generate · $${effectiveRate.toFixed(2)}` : ' Generate Label'}</>
              }
            </button>
          </div>

          {/* ── Status strip ────────────────────────────────────── */}
          {(error || successData) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0.45rem 0.875rem',
              background: error ? '#fff1f2' : '#f0fdf4',
              borderTop: `1px solid ${error ? '#fecdd3' : '#bbf7d0'}`,
            }}>
              {error
                ? <ExclamationCircleIcon style={{ width: 14, height: 14, color: '#dc2626', flexShrink: 0 }} />
                : <CheckCircleIcon       style={{ width: 14, height: 14, color: '#16a34a', flexShrink: 0 }} />
              }
              <span style={{ fontSize: '0.78rem', color: error ? '#dc2626' : '#15803d', flex: 1 }}>
                {error || (successData && `Label generated · Tracking: ${successData.tracking} · Charged: $${successData.charged} · Balance: $${successData.balance}`)}
              </span>
              <button
                type="button"
                onClick={() => { setError(''); setSuccessData(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.5, padding: '2px 4px' }}
              >
                <XMarkIcon style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}

        </div>
      </form>
    </>
  );
};

export default LabelGenerator;
