import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, TruckIcon, ShieldCheckIcon, ClockIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(formData.email, formData.password); } catch {}
  };

  const S = {
    root: {
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
    },
    brand: {
      width: '48%',
      background: 'linear-gradient(160deg, #071330 0%, #0c1f3f 55%, #1a3560 100%)',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'center',
      padding: '60px 64px',
      position: 'relative' as const,
      overflow: 'hidden' as const,
    },
    brandPattern: {
      position: 'absolute' as const,
      inset: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      pointerEvents: 'none' as const,
    },
    brandInner: { position: 'relative' as const, zIndex: 1 },
    logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 52, textDecoration: 'none' as const },
    logoIcon: {
      width: 38, height: 38,
      background: '#f96422',
      borderRadius: 9,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 19, flexShrink: 0,
    },
    logoText: { fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' },
    logoAccent: { color: '#f96422' },
    tagline: {
      fontSize: 'clamp(1.9rem, 3vw, 2.75rem)',
      fontWeight: 900,
      color: '#fff',
      letterSpacing: '-1.5px',
      lineHeight: 1.1,
      marginBottom: 18,
    },
    taglineAccent: { color: '#f96422' },
    brandSub: {
      fontSize: '1rem',
      color: 'rgba(255,255,255,0.48)',
      lineHeight: 1.75,
      marginBottom: 48,
      fontWeight: 400,
      maxWidth: 360,
    },
    featureRow: { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
    featureIconWrap: {
      width: 36, height: 36,
      borderRadius: 9,
      background: 'rgba(249,100,34,0.12)',
      border: '1px solid rgba(249,100,34,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    featureTitle: { fontSize: '0.88rem', fontWeight: 700, color: '#fff', marginBottom: 2 },
    featureDesc:  { fontSize: '0.8rem',  color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 },
    brandDivider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '36px 0' },
    carrierRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
    carrierLabel: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginBottom: 12 },
    cChip: {
      padding: '6px 14px',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 100,
      fontSize: '12px',
      fontWeight: 700,
      color: 'rgba(255,255,255,0.6)',
    },
    formPanel: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 40px',
      background: '#f7f9fc',
    },
    card: {
      width: '100%',
      maxWidth: 420,
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: 20,
      padding: '44px 40px',
      boxShadow: '0 4px 24px rgba(12,31,63,0.09), 0 1px 4px rgba(12,31,63,0.06)',
    },
    cardHead: { textAlign: 'center' as const, marginBottom: 32 },
    cardTitle: { fontSize: '1.55rem', fontWeight: 900, color: '#0c1f3f', letterSpacing: '-0.8px', marginBottom: 6 },
    cardSub:   { fontSize: '0.875rem', color: '#6b7280', fontWeight: 400 },
    label: {
      display: 'block',
      fontSize: '0.78rem',
      fontWeight: 700,
      color: '#374151',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.07em',
      marginBottom: 7,
    },
    input: {
      width: '100%',
      padding: '12px 15px',
      background: '#f7f9fc',
      border: '1.5px solid #e5e7eb',
      borderRadius: 10,
      color: '#0c1f3f',
      fontSize: '0.95rem',
      fontFamily: "'Inter', system-ui, sans-serif",
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxSizing: 'border-box' as const,
    },
    eyeBtn: {
      position: 'absolute' as const,
      right: 13, top: '50%',
      transform: 'translateY(-50%)',
      background: 'none', border: 'none',
      cursor: 'pointer',
      color: '#9ca3af',
      padding: 0,
      display: 'flex',
    },
    errorBox: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '12px 14px',
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: 10,
      fontSize: '0.85rem',
      color: '#dc2626',
      fontWeight: 500,
    },
    submitBtn: {
      width: '100%',
      padding: '13px',
      background: '#f96422',
      border: 'none',
      borderRadius: 10,
      color: '#fff',
      fontSize: '1rem',
      fontWeight: 800,
      cursor: 'pointer',
      fontFamily: "'Inter', system-ui, sans-serif",
      letterSpacing: '-0.2px',
      marginTop: 6,
      boxShadow: '0 4px 16px rgba(249,100,34,0.35)',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    submitBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' as const, boxShadow: 'none' },
    spinnerEl: {
      width: 17, height: 17,
      border: '2.5px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.75s linear infinite',
      flexShrink: 0,
    },
    divider: { height: 1, background: '#f3f4f6', margin: '24px 0' },
    signupRow: { textAlign: 'center' as const, fontSize: '0.875rem', color: '#6b7280' },
    signupLink: { color: '#f96422', fontWeight: 700, textDecoration: 'none' },
    trustRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' as const },
    trustChip: {
      padding: '4px 12px',
      background: '#f7f9fc',
      border: '1px solid #e5e7eb',
      borderRadius: 100,
      fontSize: '11px',
      fontWeight: 700,
      color: '#9ca3af',
      letterSpacing: '0.04em',
    },
  };

  const features = [
    { icon: ShieldCheckIcon, title: 'Secure & Reliable',  desc: 'Enterprise-grade security for your data' },
    { icon: ClockIcon,       title: 'Real-time Sync',     desc: 'Instant updates across USPS, FedEx & UPS' },
    { icon: TruckIcon,       title: 'Bulk Label Printing', desc: 'Print hundreds of labels in seconds' },
  ];

  return (
    <div style={S.root}>

      {/* ── Brand panel ── */}
      <div style={S.brand}>
        <div style={S.brandPattern} />
        <div style={S.brandInner}>

          {/* Logo */}
          <a href="/landing.html" style={S.logoRow}>
            <div style={S.logoIcon}>📦</div>
            <span style={S.logoText}>Label<span style={S.logoAccent}>Profit</span></span>
          </a>

          {/* Headline */}
          <h2 style={S.tagline}>
            Stop overpaying<br />
            for <span style={S.taglineAccent}>shipping labels.</span>
          </h2>
          <p style={S.brandSub}>
            The all-in-one label platform for US ecom sellers. Compare USPS, FedEx &amp; UPS rates and bulk-print in seconds.
          </p>

          {/* Feature bullets */}
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} style={S.featureRow}>
              <div style={S.featureIconWrap}>
                <Icon style={{ width: 17, height: 17, color: '#f96422' }} />
              </div>
              <div>
                <div style={S.featureTitle}>{title}</div>
                <div style={S.featureDesc}>{desc}</div>
              </div>
            </div>
          ))}

          {/* Carrier chips */}
          <div style={S.brandDivider} />
          <div style={{ ...S.carrierLabel }}>Works with all major carriers</div>
          <div style={S.carrierRow}>
            <span style={{ ...S.cChip, color: '#60a5fa' }}>USPS</span>
            <span style={{ ...S.cChip, color: '#c084fc' }}>FedEx</span>
            <span style={{ ...S.cChip, color: '#fbbf24' }}>UPS</span>
          </div>

        </div>
      </div>

      {/* ── Form panel ── */}
      <div style={S.formPanel}>
        <div style={S.card}>

          <div style={S.cardHead}>
            <h3 style={S.cardTitle}>Welcome back</h3>
            <p style={S.cardSub}>Sign in to your LabelProfit account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label htmlFor="email" style={S.label}>Email Address</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                style={S.input}
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#0c1f3f', boxShadow: '0 0 0 3px rgba(12,31,63,0.08)', background: '#fff' })}
                onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: '#e5e7eb', boxShadow: 'none', background: '#f7f9fc' })}
              />
            </div>

            <div>
              <label htmlFor="password" style={S.label}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password" required
                  style={{ ...S.input, paddingRight: '2.8rem' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#0c1f3f', boxShadow: '0 0 0 3px rgba(12,31,63,0.08)', background: '#fff' })}
                  onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: '#e5e7eb', boxShadow: 'none', background: '#f7f9fc' })}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={S.eyeBtn}>
                  {showPassword
                    ? <EyeSlashIcon style={{ width: 18, height: 18 }} />
                    : <EyeIcon     style={{ width: 18, height: 18 }} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={S.errorBox}>
                <ExclamationCircleIcon style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{ ...S.submitBtn, ...(isLoading ? S.submitBtnDisabled : {}) }}
            >
              {isLoading
                ? <><div style={S.spinnerEl} /> Signing in...</>
                : 'Sign In →'}
            </button>
          </form>

          <div style={S.divider} />

          {/* Trust row */}
          <div style={S.trustRow}>
            <span style={S.trustChip}>🔒 Secure</span>
            <span style={S.trustChip}>✅ USPS Certified</span>
            <span style={S.trustChip}>🇺🇸 US Support</span>
          </div>

          <p style={{ ...S.signupRow, marginTop: 20 }}>
            Don't have an account?{' '}
            <a href="/signup" style={S.signupLink}>Sign up free</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
