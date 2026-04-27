import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  KeyIcon, EyeIcon, EyeSlashIcon,
  CheckCircleIcon, ExclamationCircleIcon,
  BellIcon, BellSlashIcon, PencilIcon,
} from '@heroicons/react/24/outline';

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isEditing,          setIsEditing]          = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notifSaving,        setNotifSaving]        = useState(false);
  const [notifMsg,           setNotifMsg]           = useState('');
  const [showCurrentPw,      setShowCurrentPw]      = useState(false);
  const [showNewPw,          setShowNewPw]          = useState(false);
  const [showConfirmPw,      setShowConfirmPw]      = useState(false);
  const [isLoading,          setIsLoading]          = useState(false);
  const [message,            setMessage]            = useState('');
  const [error,              setError]              = useState('');

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName:  user?.lastName  || '',
    email:     user?.email     || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  });

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(''); setMessage('');
    try {
      const res = await axios.put(`/users/${user?.id}`, profileData);
      updateUser(res.data.user);
      setMessage('Profile updated.');
      setIsEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setIsLoading(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match'); return;
    }
    setIsLoading(true); setError(''); setMessage('');
    try {
      await axios.put(`/users/${user?.id}/password`, {
        currentPassword: passwordData.currentPassword,
        newPassword:     passwordData.newPassword,
      });
      setMessage('Password updated.');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update password');
    } finally { setIsLoading(false); }
  };

  const handleToggleEmailNotif = async () => {
    setNotifSaving(true); setNotifMsg('');
    try {
      const res = await axios.put(`/users/${user?.id}`, {
        emailNotifications: !(user as any)?.emailNotifications,
      });
      updateUser(res.data.user);
      setNotifMsg('Saved.');
      setTimeout(() => setNotifMsg(''), 2000);
    } catch { setNotifMsg('Failed to save.'); }
    finally { setNotifSaving(false); }
  };

  const cancelEdit = () => {
    setIsEditing(false); setError(''); setMessage('');
    setProfileData({ firstName: user?.firstName||'', lastName: user?.lastName||'', email: user?.email||'' });
  };
  const cancelPw = () => {
    setIsChangingPassword(false);
    setPasswordData({ currentPassword:'', newPassword:'', confirmPassword:'' });
    setError(''); setMessage('');
  };

  const initials     = `${user?.firstName?.charAt(0)??''}${user?.lastName?.charAt(0)??''}`;
  const emailNotifOn = (user as any)?.emailNotifications !== false;

  const roleBadgeClass =
    user?.role === 'admin'    ? 'badge badge-red'  :
    user?.role === 'reseller' ? 'badge badge-blue' : 'badge badge-gray';

  /* ── shared mini styles ─────────────────────────────────── */
  const sectionLabel: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 700, color: 'var(--navy-400)',
    letterSpacing: '0.09em', textTransform: 'uppercase',
  };
  const fieldRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.45rem 1rem', borderBottom: '1px solid var(--navy-50)',
  };
  const fieldLabel: React.CSSProperties = {
    fontSize: '0.75rem', color: 'var(--navy-400)', fontWeight: 600,
  };
  const fieldValue: React.CSSProperties = {
    fontSize: '0.78rem', color: 'var(--navy-800)', fontWeight: 500,
    textAlign: 'right', maxWidth: '60%', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
         className="animate-fadeIn">

      {/* ── Identity header ──────────────────────────────────── */}
      <div className="sh-card" style={{ padding: '0.875rem 1.1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar avatar-md avatar-indigo" style={{ flexShrink: 0, fontSize: '0.85rem' }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)' }}>
              {user?.firstName} {user?.lastName}
            </span>
            <span className={roleBadgeClass}>{user?.role}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 2 }}>{user?.email}</div>
        </div>
        <button
          onClick={() => { setIsEditing(!isEditing); setIsChangingPassword(false); setError(''); setMessage(''); }}
          className="btn btn-ghost btn-sm"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <PencilIcon style={{ width: 13, height: 13 }} />
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* ── Alerts ───────────────────────────────────────────── */}
      {message && (
        <div className="alert alert-success" style={{ padding: '0.6rem 0.875rem' }}>
          <CheckCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
          <span style={{ fontSize: '0.8rem' }}>{message}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-danger" style={{ padding: '0.6rem 0.875rem' }}>
          <ExclamationCircleIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
          <span style={{ fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      {/* ── Two-column body ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '0.75rem', alignItems: 'start' }}>

        {/* ── Left: Profile info ──────────────────────────────── */}
        <div className="sh-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={sectionLabel}>Profile</span>
          </div>

          {isEditing ? (
            <form onSubmit={handleProfileSubmit} style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>First Name</label>
                  <input name="firstName" type="text" required className="form-input"
                    style={{ padding: '0.45rem 0.7rem', fontSize: '0.82rem' }}
                    value={profileData.firstName}
                    onChange={e => setProfileData({ ...profileData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Last Name</label>
                  <input name="lastName" type="text" required className="form-input"
                    style={{ padding: '0.45rem 0.7rem', fontSize: '0.82rem' }}
                    value={profileData.lastName}
                    onChange={e => setProfileData({ ...profileData, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.7rem' }}>Email Address</label>
                <input name="email" type="email" required className="form-input"
                  style={{ padding: '0.45rem 0.7rem', fontSize: '0.82rem' }}
                  value={profileData.email}
                  onChange={e => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                <button type="submit" disabled={isLoading} className="btn btn-primary btn-sm">
                  {isLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              {[
                { label: 'First Name',   value: user?.firstName },
                { label: 'Last Name',    value: user?.lastName },
                { label: 'Email',        value: user?.email },
                { label: 'Role',         value: user?.role, cap: true },
                { label: 'Member since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—' },
                { label: 'Last login',   value: user?.lastLogin  ? new Date(user.lastLogin).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never' },
              ].map(({ label, value, cap }, i, arr) => (
                <div key={label} style={{ ...fieldRow, borderBottom: i < arr.length - 1 ? '1px solid var(--navy-50)' : 'none' }}>
                  <span style={fieldLabel}>{label}</span>
                  <span style={{ ...fieldValue, textTransform: cap ? 'capitalize' : undefined }}>{value || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right column ────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Security */}
          <div className="sh-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={sectionLabel}>Security</span>
            </div>

            {isChangingPassword ? (
              <form onSubmit={handlePasswordSubmit} style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {([
                  { id: 'currentPassword', label: 'Current password', show: showCurrentPw, toggle: () => setShowCurrentPw(!showCurrentPw) },
                  { id: 'newPassword',     label: 'New password',     show: showNewPw,     toggle: () => setShowNewPw(!showNewPw) },
                  { id: 'confirmPassword', label: 'Confirm password', show: showConfirmPw, toggle: () => setShowConfirmPw(!showConfirmPw) },
                ] as const).map(({ id, label, show, toggle }) => (
                  <div key={id}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id={id} name={id}
                        type={show ? 'text' : 'password'}
                        required minLength={12}
                        className="form-input"
                        style={{ padding: '0.45rem 2.5rem 0.45rem 0.7rem', fontSize: '0.82rem' }}
                        value={(passwordData as any)[id]}
                        onChange={e => setPasswordData({ ...passwordData, [id]: e.target.value })}
                      />
                      <button type="button" onClick={toggle} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--navy-400)', padding: 0, display: 'flex',
                      }}>
                        {show ? <EyeSlashIcon style={{ width: 15, height: 15 }} /> : <EyeIcon style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>
                ))}

                {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--danger-600)', margin: 0 }}>Passwords do not match</p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelPw}>Cancel</button>
                  <button type="submit"
                    disabled={isLoading || passwordData.newPassword !== passwordData.confirmPassword}
                    className="btn btn-primary btn-sm">
                    {isLoading ? 'Updating…' : 'Update'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>Password</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--navy-400)', marginTop: 1 }}>••••••••••••</div>
                </div>
                <button
                  onClick={() => { setIsChangingPassword(true); setIsEditing(false); }}
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <KeyIcon style={{ width: 13, height: 13 }} /> Change
                </button>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="sh-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--navy-100)' }}>
              <span style={sectionLabel}>Notifications</span>
            </div>
            <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: emailNotifOn ? '#EFF6FF' : 'var(--navy-100)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {emailNotifOn
                    ? <BellIcon     style={{ width: 14, height: 14, color: '#2563EB' }} />
                    : <BellSlashIcon style={{ width: 14, height: 14, color: 'var(--navy-400)' }} />
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)' }}>Announcement emails</div>
                  {notifMsg && (
                    <div style={{ fontSize: '0.7rem', color: notifMsg === 'Saved.' ? '#16A34A' : '#DC2626', marginTop: 1, fontWeight: 500 }}>
                      {notifMsg}
                    </div>
                  )}
                </div>
              </div>

              {/* Toggle pill */}
              <button
                onClick={handleToggleEmailNotif}
                disabled={notifSaving}
                title={emailNotifOn ? 'Turn off' : 'Turn on'}
                style={{
                  width: 38, height: 21, borderRadius: 99, border: 'none', flexShrink: 0,
                  background: emailNotifOn ? '#2563EB' : 'var(--navy-200)',
                  position: 'relative', cursor: notifSaving ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s', opacity: notifSaving ? 0.6 : 1,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2.5,
                  left: emailNotifOn ? 19 : 2.5,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          </div>

        </div>{/* /right column */}
      </div>{/* /two-column grid */}
    </div>
  );
};

export default Profile;
