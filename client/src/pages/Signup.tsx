import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, TruckIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm,  setShowConfirm]    = useState(false);
  const [localError,   setLocalError]     = useState('');
  const { register, isAuthenticated, isLoading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (isAuthenticated) navigate('/dashboard'); }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    const { firstName, lastName, email, password, confirmPassword } = formData;
    if (!firstName.trim() || !lastName.trim()) { setLocalError('First and last name are required.'); return; }
    if (password !== confirmPassword)           { setLocalError('Passwords do not match.'); return; }
    if (password.length < 12)                  { setLocalError('Password must be at least 12 characters.'); return; }
    try { await register({ firstName, lastName, email, password }); } catch {}
  };

  const displayError = localError || error;

  const PwField = ({ id, label, show, onToggle }: { id: string; label: string; show: boolean; onToggle: () => void }) => (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id} name={id} type={show ? 'text' : 'password'} required minLength={12}
          className="form-input" style={{ paddingRight: '2.75rem' }}
          placeholder="••••••••"
          value={(formData as any)[id]}
          onChange={handleChange}
          autoComplete="new-password"
        />
        <button type="button" onClick={onToggle} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
          {show ? <EyeSlashIcon style={{ width: 18, height: 18 }} /> : <EyeIcon style={{ width: 18, height: 18 }} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-layout">
      {/* Brand panel */}
      <div className="auth-brand-panel">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2.5rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TruckIcon style={{ width: 28, height: 28, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>ShipmeHub</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Label Portal</div>
            </div>
          </div>

          <h2 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '1rem' }}>
            Join the Portal
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '3rem' }}>
            Create your account and start managing USPS shipping labels with ease.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {['Manage label requests', 'Track file statuses in real-time', 'Role-based access control'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg style={{ width: 10, height: 10 }} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-panel">
        <div className="auth-card animate-fadeInUp">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy-900)', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Create Account
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label htmlFor="firstName" className="form-label">First Name</label>
                <input id="firstName" name="firstName" type="text" required autoComplete="given-name" className="form-input" placeholder="John" value={formData.firstName} onChange={handleChange} />
              </div>
              <div>
                <label htmlFor="lastName" className="form-label">Last Name</label>
                <input id="lastName" name="lastName" type="text" required autoComplete="family-name" className="form-input" placeholder="Doe" value={formData.lastName} onChange={handleChange} />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="form-label">Email Address</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="form-input" placeholder="you@example.com" value={formData.email} onChange={handleChange} />
            </div>

            <PwField id="password"        label="Password"         show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            <PwField id="confirmPassword" label="Confirm Password"  show={showConfirm}  onToggle={() => setShowConfirm(!showConfirm)} />

            {displayError && (
              <div className="alert alert-danger">
                <ExclamationCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span>{displayError}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 4 }}>
              {isLoading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, marginRight: 8 }} />Creating account...</>
                : 'Create Account'
              }
            </button>
          </form>

          <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--navy-500)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent-600)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
