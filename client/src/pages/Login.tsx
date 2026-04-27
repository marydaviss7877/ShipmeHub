import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, TruckIcon, ShieldCheckIcon, ClockIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

// Simple hook to track viewport width
function useViewport() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

const Login: React.FC = () => {
  const [formData, setFormData]     = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, isLoading, error } = useAuth();
  const navigate  = useNavigate();
  const vw        = useViewport();

  const isMobile  = vw < 640;
  const isTablet  = vw >= 640 && vw < 1024;

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

  const features = [
    { icon: ShieldCheckIcon,  title: 'Secure & Reliable',   desc: 'Enterprise-grade security for your data' },
    { icon: ClockIcon,        title: 'Real-time Sync',      desc: 'Instant updates across USPS, FedEx & UPS' },
    { icon: TruckIcon,        title: 'Bulk Label Printing', desc: 'Print hundreds of labels in seconds' },
  ];

  // ── Shared style objects ─────────────────────────────────────────────────────
  const inputBase: React.CSSProperties = {
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
    boxSizing: 'border-box',
  };

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 7,
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── Brand panel — hidden on mobile ───────────────────────────────────── */}
      {!isMobile && (
        <div style={{
          width: isTablet ? '42%' : '48%',
          background: 'linear-gradient(160deg, #071330 0%, #0c1f3f 55%, #1a3560 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isTablet ? '48px 40px' : '60px 64px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Dot-grid pattern */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.025'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          {/* Glow blobs */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 50% at 20% 60%, rgba(249,100,34,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(96,165,250,0.07) 0%, transparent 70%)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Logo */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48, textDecoration: 'none' }}>
              <div style={{ width: 38, height: 38, background: '#f96422', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>
                📦
              </div>
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span style={{ color: '#f96422' }}> Flow</span>
              </span>
            </a>

            {/* Headline */}
            <h2 style={{
              fontSize: isTablet ? '1.8rem' : 'clamp(1.9rem, 3vw, 2.75rem)',
              fontWeight: 900, color: '#fff', letterSpacing: '-1.5px',
              lineHeight: 1.1, marginBottom: 18,
            }}>
              Stop overpaying<br />
              for <span style={{ color: '#f96422' }}>shipping labels.</span>
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, marginBottom: 40, fontWeight: 400, maxWidth: 360 }}>
              The all-in-one label platform for US ecom sellers. Compare USPS, FedEx &amp; UPS rates and bulk-print in seconds.
            </p>

            {/* Feature bullets */}
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: 'rgba(249,100,34,0.12)', border: '1px solid rgba(249,100,34,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon style={{ width: 17, height: 17, color: '#f96422' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            ))}

            {/* Carrier chips */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '32px 0 24px' }} />
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>
              Works with all major carriers
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[{ label: 'USPS', c: '#60a5fa' }, { label: 'FedEx', c: '#c084fc' }, { label: 'UPS', c: '#fbbf24' }, { label: 'DHL', c: '#f97316' }].map(({ label: l, c }) => (
                <span key={l} style={{
                  padding: '6px 14px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100,
                  fontSize: '12px', fontWeight: 700, color: c,
                }}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Form panel ───────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '0' : isTablet ? '32px 24px' : '48px 40px',
        background: isMobile ? '#fff' : '#f7f9fc',
        minHeight: isMobile ? '100vh' : undefined,
      }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            width: '100%',
            background: 'linear-gradient(160deg, #071330 0%, #0c1f3f 55%, #1a3560 100%)',
            padding: '28px 24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, background: '#f96422', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                📦
              </div>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                Label<span style={{ color: '#f96422' }}> Flow</span>
              </span>
            </a>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Shipping labels for US ecom sellers
            </p>
          </div>
        )}

        {/* Card */}
        <div style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 420,
          background: '#ffffff',
          border: isMobile ? 'none' : '1px solid #e5e7eb',
          borderRadius: isMobile ? 0 : 20,
          padding: isMobile ? '28px 20px 40px' : '44px 40px',
          boxShadow: isMobile ? 'none' : '0 4px 24px rgba(12,31,63,0.09), 0 1px 4px rgba(12,31,63,0.06)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h3 style={{ fontSize: isMobile ? '1.35rem' : '1.55rem', fontWeight: 900, color: '#0c1f3f', letterSpacing: '-0.8px', marginBottom: 6 }}>
              Welcome back
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 400 }}>
              Sign in to your Label Flow account
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label htmlFor="email" style={label}>Email Address</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                style={inputBase}
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#0c1f3f', boxShadow: '0 0 0 3px rgba(12,31,63,0.08)', background: '#fff' })}
                onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: '#e5e7eb', boxShadow: 'none', background: '#f7f9fc' })}
              />
            </div>

            <div>
              <label htmlFor="password" style={label}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password" required
                  style={{ ...inputBase, paddingRight: '2.8rem' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={e => Object.assign(e.currentTarget.style, { borderColor: '#0c1f3f', boxShadow: '0 0 0 3px rgba(12,31,63,0.08)', background: '#fff' })}
                  onBlur={e  => Object.assign(e.currentTarget.style, { borderColor: '#e5e7eb', boxShadow: 'none', background: '#f7f9fc' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}
                >
                  {showPassword
                    ? <EyeSlashIcon style={{ width: 18, height: 18 }} />
                    : <EyeIcon      style={{ width: 18, height: 18 }} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 10,
                fontSize: '0.85rem', color: '#dc2626', fontWeight: 500,
              }}>
                <ExclamationCircleIcon style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%', padding: '13px',
                background: '#f96422', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: '1rem', fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontFamily: "'Inter', system-ui, sans-serif",
                letterSpacing: '-0.2px', marginTop: 6,
                boxShadow: isLoading ? 'none' : '0 4px 16px rgba(249,100,34,0.35)',
                opacity: isLoading ? 0.6 : 1,
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isLoading ? (
                <>
                  <div style={{ width: 17, height: 17, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite', flexShrink: 0 }} />
                  Signing in...
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          <div style={{ height: 1, background: '#f3f4f6', margin: '24px 0' }} />

          {/* Trust chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {['🔒 Secure', '✅ USPS Certified', '🇺🇸 US Support'].map(t => (
              <span key={t} style={{
                padding: '4px 12px', background: '#f7f9fc',
                border: '1px solid #e5e7eb', borderRadius: 100,
                fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.04em',
              }}>{t}</span>
            ))}
          </div>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem', color: '#6b7280' }}>
            Don't have an account?{' '}
            <a href="/signup" style={{ color: '#f96422', fontWeight: 700, textDecoration: 'none' }}>Sign up free</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
