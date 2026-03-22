import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { KeyIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const Profile: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [isEditing,          setIsEditing]          = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
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
