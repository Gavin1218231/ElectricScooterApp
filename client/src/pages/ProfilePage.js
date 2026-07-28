import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { formatServerDate } from '../utils/date';

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const data = await api.updateProfile({ name, phone });
      updateUser(data.user);
      setEditing(false);
      setMessage('Profile updated');
      setMessageType('success');
    } catch (err) {
      setMessage(err.message);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) =>
    formatServerDate(dateStr, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={styles.page}>
      {/* Profile header */}
      <div style={styles.profileHeader}>
        <div style={styles.avatar}>
          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <h2 style={styles.name}>{user?.name}</h2>
        <p style={styles.email}>{user?.email}</p>
        {user?.role === 'admin' && (
          <span className="badge badge-green" style={{ marginTop: '8px' }}>Admin</span>
        )}
      </div>

      {message && <div style={styles.messageContainer}>
        <div className={messageType === 'success' ? 'success-message' : 'error-message'}>
          {message}
        </div>
      </div>}

      {/* Profile details */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Profile Details</h3>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            className="btn btn-sm btn-outline"
            disabled={saving}
          >
            {editing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
          </button>
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>Name</label>
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={styles.fieldInput}
            />
          ) : (
            <p style={styles.fieldValue}>{user?.name}</p>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>Email</label>
          <p style={styles.fieldValue}>{user?.email}</p>
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>Phone</label>
          {editing ? (
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={styles.fieldInput}
              placeholder="Add phone number"
            />
          ) : (
            <p style={styles.fieldValue}>{user?.phone || 'Not set'}</p>
          )}
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>Member since</label>
          <p style={styles.fieldValue}>{formatDate(user?.created_at)}</p>
        </div>
      </div>

      {/* Account section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Account</h3>

        <div style={styles.menuItem}>
          <span>Wallet Balance</span>
          <span style={{ color: '#00D26A', fontWeight: '700' }}>${user?.balance?.toFixed(2)}</span>
        </div>

        <div style={styles.menuItem}>
          <span>Role</span>
          <span style={{ textTransform: 'capitalize' }}>{user?.role}</span>
        </div>
      </div>

      {/* App info */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>About</h3>
        <div style={styles.menuItem}>
          <span>App Version</span>
          <span style={{ color: '#9CA3AF' }}>1.0.0</span>
        </div>
        <div style={styles.menuItem}>
          <span>Service</span>
          <span style={{ color: '#9CA3AF' }}>Vim Scooters</span>
        </div>
      </div>

      {/* Logout */}
      <div style={styles.logoutSection}>
        <button onClick={logout} className="btn btn-outline" style={{ color: '#EF4444', borderColor: '#FCA5A5' }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F3F4F6',
    paddingBottom: '100px',
  },
  profileHeader: {
    background: 'white',
    padding: '32px 24px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  avatar: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00D26A, #00B85C)',
    color: 'white',
    fontSize: '32px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  name: {
    fontSize: '22px',
    fontWeight: '700',
  },
  email: {
    color: '#6B7280',
    fontSize: '14px',
    marginTop: '4px',
  },
  messageContainer: {
    padding: '16px 16px 0',
  },
  section: {
    padding: '20px 16px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
  },
  field: {
    padding: '14px 16px',
    background: 'white',
    borderRadius: '10px',
    marginBottom: '8px',
  },
  fieldLabel: {
    fontSize: '12px',
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  fieldValue: {
    fontSize: '16px',
    marginTop: '4px',
    fontWeight: '500',
  },
  fieldInput: {
    width: '100%',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '16px',
    marginTop: '4px',
    outline: 'none',
  },
  menuItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'white',
    borderRadius: '10px',
    marginBottom: '8px',
    fontSize: '15px',
  },
  logoutSection: {
    padding: '0 16px 24px',
  },
};
