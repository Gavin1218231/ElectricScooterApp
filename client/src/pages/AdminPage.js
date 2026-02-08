import React, { useState, useEffect } from 'react';
import api from '../utils/api';

export default function AdminPage() {
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [scooters, setScooters] = useState([]);
  const [scooterStats, setScooterStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddScooter, setShowAddScooter] = useState(false);
  const [newScooter, setNewScooter] = useState({ code: '', model: 'Vim S1', latitude: '26.6406', longitude: '-81.8723' });
  const [editingScooter, setEditingScooter] = useState(null);

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      switch (t) {
        case 'dashboard':
          const d = await api.getDashboard();
          setDashboard(d);
          break;
        case 'scooters':
          const s = await api.getAllScooters();
          setScooters(s.scooters);
          setScooterStats(s.stats);
          break;
        case 'users':
          const u = await api.getAdminUsers();
          setUsers(u.users);
          break;
        case 'rides':
          const r = await api.getAdminRides();
          setRides(r.rides);
          break;
        default:
          break;
      }
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleAddScooter = async () => {
    try {
      await api.addScooter({
        ...newScooter,
        latitude: parseFloat(newScooter.latitude),
        longitude: parseFloat(newScooter.longitude),
      });
      setShowAddScooter(false);
      setNewScooter({ code: '', model: 'Vim S1', latitude: '26.6406', longitude: '-81.8723' });
      loadTab('scooters');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateScooter = async (id, updates) => {
    try {
      await api.updateScooter(id, updates);
      setEditingScooter(null);
      loadTab('scooters');
    } catch (err) {
      alert(err.message);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const statusBadge = (status) => {
    const map = { available: 'badge-green', in_use: 'badge-blue', maintenance: 'badge-orange', low_battery: 'badge-red', disabled: 'badge-gray', active: 'badge-blue', completed: 'badge-green' };
    return map[status] || 'badge-gray';
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['dashboard', 'scooters', 'users', 'rides'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner" style={{ marginTop: '60px' }} />
      ) : (
        <div style={styles.content}>
          {/* Dashboard tab */}
          {tab === 'dashboard' && dashboard && (
            <>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <span style={styles.statNumber}>{dashboard.stats.totalUsers}</span>
                  <span style={styles.statLabel}>Users</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statNumber}>{dashboard.stats.totalScooters}</span>
                  <span style={styles.statLabel}>Scooters</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statNumber}>{dashboard.stats.totalRides}</span>
                  <span style={styles.statLabel}>Total Rides</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statNumber}>{dashboard.stats.activeRides}</span>
                  <span style={styles.statLabel}>Active</span>
                </div>
                <div style={styles.statCard}>
                  <span style={{ ...styles.statNumber, color: '#00D26A' }}>${dashboard.stats.totalRevenue.toFixed(2)}</span>
                  <span style={styles.statLabel}>Revenue</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statNumber}>{dashboard.stats.avgRating}/5</span>
                  <span style={styles.statLabel}>Avg Rating</span>
                </div>
              </div>

              <h3 style={styles.subTitle}>Fleet Status</h3>
              <div style={styles.fleetGrid}>
                {dashboard.scootersByStatus.map(s => (
                  <div key={s.status} style={styles.fleetItem}>
                    <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span>
                    <span style={styles.fleetCount}>{s.count}</span>
                  </div>
                ))}
              </div>

              <h3 style={styles.subTitle}>Top Riders</h3>
              {dashboard.topRiders.map((rider, i) => (
                <div key={i} style={styles.listItem}>
                  <div>
                    <p style={styles.listTitle}>{rider.name}</p>
                    <p style={styles.listSubtitle}>{rider.email}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={styles.listValue}>{rider.ride_count} rides</p>
                    <p style={styles.listSubtitle}>${rider.total_spent.toFixed(2)} spent</p>
                  </div>
                </div>
              ))}

              <h3 style={styles.subTitle}>Recent Rides</h3>
              {dashboard.recentRides.map(ride => (
                <div key={ride.id} style={styles.listItem}>
                  <div>
                    <p style={styles.listTitle}>{ride.user_name} - {ride.scooter_code}</p>
                    <p style={styles.listSubtitle}>{formatDate(ride.started_at)}</p>
                  </div>
                  <span className={`badge ${statusBadge(ride.status)}`}>{ride.status}</span>
                </div>
              ))}
            </>
          )}

          {/* Scooters tab */}
          {tab === 'scooters' && (
            <>
              {scooterStats && (
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <span style={styles.statNumber}>{scooterStats.total}</span>
                    <span style={styles.statLabel}>Total</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={{ ...styles.statNumber, color: '#00D26A' }}>{scooterStats.available}</span>
                    <span style={styles.statLabel}>Available</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={{ ...styles.statNumber, color: '#3B82F6' }}>{scooterStats.in_use}</span>
                    <span style={styles.statLabel}>In Use</span>
                  </div>
                  <div style={styles.statCard}>
                    <span style={{ ...styles.statNumber, color: '#EF4444' }}>{scooterStats.maintenance + scooterStats.low_battery}</span>
                    <span style={styles.statLabel}>Needs Attn</span>
                  </div>
                </div>
              )}

              <button onClick={() => setShowAddScooter(!showAddScooter)} className="btn btn-primary btn-sm" style={{ marginBottom: '16px' }}>
                {showAddScooter ? 'Cancel' : '+ Add Scooter'}
              </button>

              {showAddScooter && (
                <div className="card">
                  <div className="input-group">
                    <label>Code</label>
                    <input value={newScooter.code} onChange={e => setNewScooter({...newScooter, code: e.target.value})} placeholder="VIM-0051" />
                  </div>
                  <div className="input-group">
                    <label>Model</label>
                    <select value={newScooter.model} onChange={e => setNewScooter({...newScooter, model: e.target.value})}>
                      <option>Vim S1</option>
                      <option>Vim S2</option>
                      <option>Vim Pro</option>
                      <option>Vim Max</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label>Latitude</label>
                      <input value={newScooter.latitude} onChange={e => setNewScooter({...newScooter, latitude: e.target.value})} />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                      <label>Longitude</label>
                      <input value={newScooter.longitude} onChange={e => setNewScooter({...newScooter, longitude: e.target.value})} />
                    </div>
                  </div>
                  <button onClick={handleAddScooter} className="btn btn-primary">Add Scooter</button>
                </div>
              )}

              {scooters.map(scooter => (
                <div key={scooter.id} style={styles.listItem}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={styles.listTitle}>{scooter.code}</span>
                      <span className={`badge ${statusBadge(scooter.status)}`}>{scooter.status}</span>
                    </div>
                    <p style={styles.listSubtitle}>
                      {scooter.model} | {scooter.battery_level}% battery | {scooter.total_rides} rides
                    </p>
                  </div>
                  {editingScooter === scooter.id ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['available', 'maintenance', 'disabled'].map(s => (
                        <button key={s} onClick={() => handleUpdateScooter(scooter.id, { status: s })}
                          className={`btn btn-sm ${s === 'available' ? 'btn-primary' : 'btn-outline'}`}
                          style={{ fontSize: '11px', padding: '4px 8px' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEditingScooter(scooter.id)} className="btn btn-sm btn-outline">
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Users tab */}
          {tab === 'users' && (
            <>
              {users.map(u => (
                <div key={u.id} style={styles.listItem}>
                  <div>
                    <p style={styles.listTitle}>{u.name}</p>
                    <p style={styles.listSubtitle}>{u.email} {u.phone ? `| ${u.phone}` : ''}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-orange' : 'badge-green'}`}>{u.role}</span>
                    <p style={{ ...styles.listSubtitle, marginTop: '4px' }}>${u.balance.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Rides tab */}
          {tab === 'rides' && (
            <>
              {rides.map(ride => (
                <div key={ride.id} style={styles.listItem}>
                  <div>
                    <p style={styles.listTitle}>{ride.user_name} - {ride.scooter_code}</p>
                    <p style={styles.listSubtitle}>
                      {ride.duration} min | {(ride.distance / 1000).toFixed(2)} km | ${(ride.cost + ride.unlock_fee).toFixed(2)}
                    </p>
                    <p style={styles.listSubtitle}>{formatDate(ride.started_at)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${statusBadge(ride.status)}`}>{ride.status}</span>
                    {ride.rating && <p style={{ color: '#F59E0B', marginTop: '4px' }}>{'★'.repeat(ride.rating)}</p>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#F3F4F6',
    paddingBottom: '80px',
  },
  header: {
    background: '#1A1A2E',
    padding: '20px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#00D26A',
  },
  tabs: {
    display: 'flex',
    background: 'white',
    padding: '4px',
    margin: '12px 16px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    background: 'none',
    fontSize: '13px',
    fontWeight: '600',
    color: '#6B7280',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  tabActive: {
    background: '#00D26A',
    color: 'white',
  },
  content: {
    padding: '0 16px 16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '20px',
  },
  statCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '16px 12px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  statNumber: {
    display: 'block',
    fontSize: '24px',
    fontWeight: '700',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6B7280',
    marginTop: '2px',
  },
  subTitle: {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '12px',
    marginTop: '20px',
  },
  fleetGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  },
  fleetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'white',
    padding: '8px 14px',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  fleetCount: {
    fontWeight: '700',
    fontSize: '16px',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'white',
    borderRadius: '10px',
    marginBottom: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  listTitle: {
    fontWeight: '600',
    fontSize: '15px',
  },
  listSubtitle: {
    color: '#9CA3AF',
    fontSize: '13px',
    marginTop: '2px',
  },
  listValue: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#00D26A',
  },
};
