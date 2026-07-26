import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const statusColors = {
  completed: 'badge-green',
  active: 'badge-blue',
  cancelled: 'badge-red',
  paused: 'badge-orange',
};

export default function HistoryPage() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getRideHistory(1);
        if (cancelled) return;
        setRides(data.rides || []);
        setTotal(data.total || 0);
        setPage(1);
      } catch (err) {
        if (!cancelled) setError('Could not load your ride history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    try {
      const next = page + 1;
      const data = await api.getRideHistory(next);
      // De-dupe defensively: rides can shift between pages if a new one lands.
      setRides(prev => {
        const seen = new Set(prev.map(r => r.id));
        return [...prev, ...(data.rides || []).filter(r => !seen.has(r.id))];
      });
      setTotal(data.total || 0);
      setPage(next);
    } catch (err) {
      setError('Could not load more rides.');
    } finally {
      setLoadingMore(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  if (loading) {
    return <div style={styles.page}><div className="spinner" style={{ marginTop: '40vh' }} /></div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Ride History</h1>
        <span style={styles.count}>{total} rides</span>
      </div>

      <div style={styles.list}>
        {rides.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.emptyText}>No rides yet. Start your first ride!</p>
          </div>
        ) : (
          rides.map(ride => (
            <div key={ride.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <span style={styles.scooterCode}>{ride.scooter_code}</span>
                  <span style={styles.model}>{ride.scooter_model}</span>
                </div>
                <span className={`badge ${statusColors[ride.status] || 'badge-gray'}`}>
                  {ride.status}
                </span>
              </div>

              <div style={styles.cardStats}>
                <div style={styles.cardStat}>
                  <span style={styles.cardStatLabel}>Duration</span>
                  <span style={styles.cardStatValue}>{ride.duration || 0} min</span>
                </div>
                <div style={styles.cardStat}>
                  <span style={styles.cardStatLabel}>Distance</span>
                  <span style={styles.cardStatValue}>{((ride.distance || 0) / 1000).toFixed(2)} km</span>
                </div>
                <div style={styles.cardStat}>
                  <span style={styles.cardStatLabel}>Cost</span>
                  <span style={{ ...styles.cardStatValue, color: '#00D26A' }}>
                    ${((ride.cost || 0) + (ride.unlock_fee || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={styles.cardFooter}>
                <span style={styles.date}>{formatDate(ride.started_at)}</span>
                {ride.rating && (
                  <span style={styles.rating}>
                    {'★'.repeat(ride.rating)}{'☆'.repeat(5 - ride.rating)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}

        {error && <div className="error-message" style={{ marginTop: '12px' }}>{error}</div>}

        {rides.length > 0 && rides.length < total && (
          <button
            onClick={loadMore}
            className="btn btn-outline"
            disabled={loadingMore}
            style={{ marginTop: '4px' }}
          >
            {loadingMore ? 'Loading...' : `Load more (${total - rides.length} older)`}
          </button>
        )}
      </div>
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
    background: 'white',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
  },
  count: {
    fontSize: '14px',
    color: '#6B7280',
    background: '#F3F4F6',
    padding: '4px 12px',
    borderRadius: '20px',
  },
  list: {
    padding: '16px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  scooterCode: {
    fontWeight: '700',
    fontSize: '16px',
    marginRight: '8px',
  },
  model: {
    color: '#6B7280',
    fontSize: '13px',
  },
  cardStats: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderTop: '1px solid #F3F4F6',
    borderBottom: '1px solid #F3F4F6',
  },
  cardStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  cardStatLabel: {
    fontSize: '12px',
    color: '#9CA3AF',
    marginBottom: '2px',
  },
  cardStatValue: {
    fontSize: '15px',
    fontWeight: '600',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
  },
  date: {
    fontSize: '13px',
    color: '#9CA3AF',
  },
  rating: {
    color: '#F59E0B',
    fontSize: '14px',
    letterSpacing: '1px',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 24px',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: '16px',
  },
};
