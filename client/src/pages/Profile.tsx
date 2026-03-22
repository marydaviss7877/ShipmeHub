import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { KeyIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, ExclamationCircleIcon, BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isEditing,          setIsEditing]          = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notifSaving,        setNotifSaving]        = useState(false);
  const [notifMsg,           setNotifMsg]           = useState('');
  const [showCurrentPw,      setShowCurrentPw]      = useState(false);
  const [showNewPw,          setShowNewPw]           = useState(false);
  const [showConfirmPw,      setShowConfirmPw]       = useState(false);
  const [isLoading,          setIsLoading]           = useState(false);
  const [message,            setMessage]             = useState('');
  const [error,              setError]               = useState('');

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
      setMessage('Profile updated successfully');
      setIsEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally { setIsLoading(false); }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) { setError('New passwords do not match'); return; }
    setIsLoading(true); setError(''); setMessage('');
    try {
      await axios.put(`/users/${user?.id}/password`, { currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword });
      setMessage('Password updated successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update password');
    } finally { setIsLoading(false); }
  };

  const handleToggleEmailNotif = async () => {
    setNotifSaving(true); setNotifMsg('');
    try {
      const res = await axios.put(`/users/${user?.id}`, { emailNotifications: !(user as any)?.emailNotifications });
      updateUser(res.data.user);
      setNotifMsg('Preference saved.');
      setTimeout(() => setNotifMsg(''), 2500);
    } catch { setNotifMsg('Failed to save.'); }
    finally { setNotifSaving(false); }
  };

  const initials = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`;

  const roleBadgeClass = user?.role === 'admin' ? 'badge badge-red' : user?.role === 'reseller' ? 'badge badge-blue' : 'badge badge-gray';

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-fadeIn">

      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your personal information and password.</p>
      </div>

      {/* Profile info card */}
      <div className="sh-card">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Profile Information</h2>
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn btn-ghost btn-sm">Edit Profile</button>
          )}
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
            <div className="avatar avatar-lg avatar-indigo">{initials}</div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy-900)' }}>{user?.firstName} {user?.lastName}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className={roleBadgeClass}>{user?.role}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--navy-500)' }}>{user?.email}</span>
              </div>
            </div>
          </div>

          {message && (
            <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
              <CheckCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
              <ExclamationCircleIcon style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">First Name</label>
                  <input name="firstName" type="text" required className="form-input" value={profileData.firstName} onChange={e => setProfileData({ ...profileData, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input name="lastName" type="text" required className="form-input" value={profileData.lastName} onChange={e => setProfileData({ ...profileData, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label">Email Address</label>
                <input name="email" type="email" required className="form-input" value={profileData.email} onChange={e => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setIsEditing(false); setError(''); setMessage(''); setProfileData({ firstName: user?.firstName || '', lastName: user?.lastName || '', email: user?.email || '' }); }}>
                  Cancel
                </button>
                <button type="submit" disabled={isLoading} className="btn btn-primary">
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { label: 'First Name',    value: user?.firstName },
                { label: 'Last Name',     value: user?.lastName },
                { label: 'Email Address', value: user?.email },
                { label: 'Role',          value: user?.role, capitalize: true },
                { label: 'Member Since',  value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A' },
                { label: 'Last Login',    value: user?.lastLogin  ? new Date(user.lastLogin).toLocaleString()  : 'Never' },
              ].map(({ label, value, capitalize }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--navy-400)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--navy-900)', fontWeight: 500, textTransform: capitalize ? 'capitalize' : undefined }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification Preferences card */}
      <div className="sh-card">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--navy-100)' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Notification Preferences</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--navy-400)', marginTop: 3 }}>Choose which notifications you receive by email.</p>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.875rem 1rem', borderRadius: 10,
            border: '1.5px solid var(--navy-150, #e8edf5)', background: 'var(--navy-50)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: (user as any)?.emailNotifications !== false ? '#EFF6FF' : 'var(--navy-100)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {(user as any)?.emailNotifications !== false
                  ? <BellIcon style={{ width: 17, height: 17, color: '#2563EB' }} />
                  : <BellSlashIcon style={{ width: 17, height: 17, color: 'var(--navy-400)' }} />
                }
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy-900)' }}>Announcement emails</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', marginTop: 1 }}>
                  Receive an email when new announcements are published on the platform.
                </div>
              </div>
            </div>

            {/* Toggle */}
            <button
              onClick={handleToggleEmailNotif}
              disabled={notifSaving}
              title={(user as any)?.emailNotifications !== false ? 'Turn off' : 'Turn on'}
              style={{
                width: 44, height: 24, borderRadius: 99, border: 'none',
                background: (user as any)?.emailNotifications !== false ? '#2563EB' : 'var(--navy-200)',
                position: 'relative', cursor: notifSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s', flexShrink: 0,
                opacity: notifSaving ? 0.6 : 1,
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: (user as any)?.emailNotifications !== false ? 22 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {notifMsg && (
            <p style={{ fontSize: '0.78rem', color: notifMsg === 'Preference saved.' ? '#16A34A' : '#DC2626', marginTop: 8, fontWeight: 500 }}>
              {notifMsg}
            </p>
          )}
        </div>
      </div>

      {/* Change Password card */}
      <div className="sh-card">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--navy-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-900)' }}>Change Password</h2>
          {!isChangingPassword && (
            <button onClick={() => setIsChangingPassword(true)} className="btn btn-ghost btn-sm">
              <KeyIcon style={{ width: 15, height: 15 }} /> Change Password
            </button>
          )}
        </div>

        <div style={{ padding: '1.5rem' }}>
          {isChangingPassword ? (
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { id: 'currentPassword', label: 'Current Password', show: showCurrentPw, toggle: () => setShowCurrentPw(!showCurrentPw) },
                { id: 'newPassword',     label: 'New Password',     show: showNewPw,     toggle: () => setShowNewPw(!showNewPw) },
                { id: 'confirmPassword', label: 'Confirm Password', show: showConfirmPw, toggle: () => setShowConfirmPw(!showConfirmPw) },
              ].map(({ id, label, show, toggle }) => (
                <div key={id}>
                  <label className="form-label">{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id={id} name={id} type={show ? 'text' : 'password'} required minLength={6}
                      className="form-input" style={{ paddingRight: '2.75rem' }}
                      value={(passwordData as any)[id]}
                      onChange={e => setPasswordData({ ...passwordData, [id]: e.target.value })}
                    />
                    <button type="button" onClick={toggle} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)', padding: 0, display: 'flex' }}>
                      {show ? <EyeSlashIcon style={{ width: 17, height: 17 }} /> : <EyeIcon style={{ width: 17, height: 17 }} />}
                    </button>
                  </div>
                </div>
              ))}

              {passwordData.newPassword && passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                <p style={{ fontSize: '0.8rem', color: 'var(--danger-600)' }}>Passwords do not match</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setIsChangingPassword(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setError(''); setMessage(''); }}>
                  Cancel
                </button>
                <button type="submit" disabled={isLoading || passwordData.newPassword !== passwordData.confirmPassword} className="btn btn-primary">
                  {isLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          ) : (
            <p style={{ fontSize: '0.875rem', color: 'var(--navy-500)' }}>Click "Change Password" to update your password.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
