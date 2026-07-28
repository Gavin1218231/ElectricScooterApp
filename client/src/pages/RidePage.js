import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { parseServerTime } from '../utils/date';
import { useAuth } from '../context/AuthContext';

export default function RidePage() {
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [summary, setSummary] = useState(null);
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [endError, setEndError] = useState('');
  const [loadError, setLoadError] = useState('');
  const { updateUser } = useAuth();
  const navigate = useNavigate();

  const fetchActiveRide = useCallback(async () => {
    try {
      const data = await api.getActiveRide();
      setRide(data.ride ? data.ride : null);
      setLoadError('');
    } catch (err) {
      // Never render a failed lookup as "no active ride" — a ride could be
      // live and billing right now. Surface it and offer a retry instead.
      setLoadError('Could not check for an active ride.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveRide();
  }, [fetchActiveRide]);

  // Derive elapsed time from the server's started_at rather than counting our
  // own ticks, so the timer stays accurate if the tab is throttled or the
  // device sleeps.
  useEffect(() => {
    if (!ride || ride.status !== 'active' || !ride.started_at) return;
    const startMs = parseServerTime(ride.started_at);
    if (startMs == null) return;

    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, ride?.status, ride?.started_at]);

  // Keep scooter battery / server-side stats fresh during a long ride.
  useEffect(() => {
    if (!ride || ride.status !== 'active') return;
    const id = setInterval(fetchActiveRide, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, ride?.status, fetchActiveRide]);

  const handleEndRide = async () => {
    if (!ride) return;
    setEnding(true);
    setEndError('');
    try {
      const endLat = ride.current_lat != null ? ride.current_lat : ride.start_latitude;
      const endLng = ride.current_lng != null ? ride.current_lng : ride.start_longitude;

      const result = await api.endRide(ride.id, endLat, endLng);
      setSummary(result.summary);
      if (result.user) updateUser(result.user);
      setRide({ ...ride, status: 'completed', id: ride.id });
    } catch (err) {
      setEndError(err.message);
    } finally {
      setEnding(false);
    }
  };

  const [ratingError, setRatingError] = useState('');

  const handleRate = async (stars) => {
    setRatingError('');
    try {
      await api.rateRide(ride.id, stars);
      // Only light the stars once the write actually succeeded, so a failure
      // doesn't leave the UI claiming a rating that was never saved.
      setRating(stars);
      setRatingSubmitted(true);
    } catch (err) {
      setRatingError(err.message || 'Could not save your rating.');
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div className="spinner" style={{ marginTop: '40vh' }} />
      </div>
    );
  }

  // Ride summary (after ending)
  if (summary) {
    return (
      <div style={styles.page}>
        <div style={styles.summaryContainer}>
          <div style={styles.checkmark}>&#10003;</div>
          <h2 style={styles.summaryTitle}>Ride Complete</h2>

          <div style={styles.summaryCard}>
            <div style={styles.summaryRow}>
              <span>Duration</span>
              <span style={styles.summaryValue}>{summary.duration} min</span>
            </div>
            <div style={styles.summaryRow}>
              <span>Distance</span>
              <span style={styles.summaryValue}>{(summary.distance / 1000).toFixed(2)} km</span>
            </div>
            <div style={styles.divider} />
            <div style={styles.summaryRow}>
              <span>Unlock fee</span>
              <span>${summary.unlock_fee.toFixed(2)}</span>
            </div>
            <div style={styles.summaryRow}>
              <span>Ride ({summary.duration} min x ${summary.duration > 0 ? (summary.ride_cost / summary.duration).toFixed(2) : '0.00'})</span>
              <span>${summary.ride_cost.toFixed(2)}</span>
            </div>
            <div style={styles.divider} />
            <div style={styles.summaryRow}>
              <span style={{ fontWeight: '700', fontSize: '18px' }}>Total</span>
              <span style={{ fontWeight: '700', fontSize: '18px', color: '#00D26A' }}>
                ${summary.total_charged.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Rating */}
          <div style={styles.ratingSection}>
            <p style={styles.ratingLabel}>
              {ratingSubmitted ? 'Thanks for your feedback!' : 'Rate your ride'}
            </p>
            <div style={styles.stars}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => !ratingSubmitted && handleRate(star)}
                  style={{
                    ...styles.star,
                    color: star <= rating ? '#F59E0B' : '#D1D5DB',
                  }}
                >
                  &#9733;
                </button>
              ))}
            </div>
            {ratingError && (
              <div className="error-message" style={{ marginTop: '10px' }}>{ratingError}</div>
            )}
          </div>

          <button onClick={() => navigate('/')} className="btn btn-primary" style={{ marginTop: '24px' }}>
            Find Another Scooter
          </button>
        </div>
      </div>
    );
  }

  // Lookup failed — distinct from "no ride", because a ride may be running.
  if (!ride && loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>!</div>
          <h2 style={styles.emptyTitle}>Couldn't Load Your Ride</h2>
          <p style={styles.emptyText}>
            {loadError} If a ride is in progress it is still running — retry before starting a new one.
          </p>
          <button
            onClick={() => { setLoading(true); fetchActiveRide(); }}
            className="btn btn-primary"
            style={{ marginTop: '24px' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No active ride
  if (!ride) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>~</div>
          <h2 style={styles.emptyTitle}>No Active Ride</h2>
          <p style={styles.emptyText}>
            Find a scooter on the map and unlock it to start riding.
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary" style={{ marginTop: '24px' }}>
            Find Scooters
          </button>
        </div>
      </div>
    );
  }

  // Active ride
  const fee = ride.unlock_fee || 0;
  const rate = ride.per_minute_rate || 0;
  // Mirror the server's billing: at least 1 minute, rounded up.
  const billedMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const runningCost = (fee + billedMinutes * rate).toFixed(2);
  const clockMinutes = Math.floor(elapsedSeconds / 60);
  const clockSeconds = elapsedSeconds % 60;

  return (
    <div style={styles.page}>
      <div style={styles.rideContainer}>
        <div style={styles.rideHeader}>
          <span style={styles.ridePulse} />
          <span style={styles.rideStatus}>Ride in Progress</span>
        </div>

        <div style={styles.rideScooter}>
          <h2 style={styles.rideCode}>{ride.scooter_code}</h2>
          <p style={styles.rideModel}>{ride.scooter_model}</p>
        </div>

        <div style={styles.rideStats}>
          <div style={styles.rideStat}>
            <span style={styles.rideStatValue}>
              {clockMinutes}:{String(clockSeconds).padStart(2, '0')}
            </span>
            <span style={styles.rideStatLabel}>ELAPSED</span>
          </div>
          <div style={styles.rideStatDivider} />
          <div style={styles.rideStat}>
            <span style={styles.rideStatValue}>${runningCost}</span>
            <span style={styles.rideStatLabel}>COST</span>
          </div>
          <div style={styles.rideStatDivider} />
          <div style={styles.rideStat}>
            <span style={styles.rideStatValue}>{ride.battery_level != null ? ride.battery_level : '--'}%</span>
            <span style={styles.rideStatLabel}>BATTERY</span>
          </div>
        </div>

        <div style={styles.rideInfo}>
          <p style={styles.rideInfoText}>
            ${ride.per_minute_rate.toFixed(2)}/min | Unlock fee: ${ride.unlock_fee.toFixed(2)}
          </p>
        </div>

        <div style={styles.rideActions}>
          {endError && <div className="error-message" style={{ marginBottom: '12px' }}>{endError}</div>}
          <button
            onClick={handleEndRide}
            className="btn btn-danger"
            disabled={ending}
            style={styles.endBtn}
          >
            {ending ? 'Ending Ride...' : 'End Ride & Lock'}
          </button>
        </div>
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
  // Active ride styles
  rideContainer: {
    padding: '20px 16px',
  },
  rideHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
    padding: '12px 16px',
    background: '#E6FBF0',
    borderRadius: '12px',
  },
  ridePulse: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#00D26A',
    animation: 'pulse 2s infinite',
  },
  rideStatus: {
    fontWeight: '600',
    color: '#00B85C',
    fontSize: '15px',
  },
  rideScooter: {
    textAlign: 'center',
    padding: '24px 0',
  },
  rideCode: {
    fontSize: '36px',
    fontWeight: '800',
    letterSpacing: '-1px',
  },
  rideModel: {
    color: '#6B7280',
    marginTop: '4px',
  },
  rideStats: {
    display: 'flex',
    justifyContent: 'space-around',
    background: 'white',
    borderRadius: '16px',
    padding: '24px 16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  rideStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  rideStatValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1A1A2E',
  },
  rideStatLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#6B7280',
    marginTop: '4px',
    letterSpacing: '1px',
  },
  rideStatDivider: {
    width: '1px',
    background: '#E5E7EB',
  },
  rideInfo: {
    textAlign: 'center',
    marginTop: '16px',
  },
  rideInfoText: {
    color: '#6B7280',
    fontSize: '14px',
  },
  rideActions: {
    marginTop: '32px',
  },
  endBtn: {
    padding: '18px 24px',
    fontSize: '18px',
    borderRadius: '16px',
  },
  // Summary styles
  summaryContainer: {
    padding: '40px 24px',
    textAlign: 'center',
  },
  checkmark: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#00D26A',
    color: 'white',
    fontSize: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  summaryTitle: {
    fontSize: '24px',
    marginBottom: '24px',
  },
  summaryCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'left',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    fontSize: '15px',
    color: '#374151',
  },
  summaryValue: {
    fontWeight: '600',
  },
  divider: {
    height: '1px',
    background: '#E5E7EB',
    margin: '4px 0',
  },
  ratingSection: {
    marginTop: '24px',
  },
  ratingLabel: {
    color: '#6B7280',
    marginBottom: '8px',
    fontSize: '14px',
  },
  stars: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  },
  star: {
    background: 'none',
    border: 'none',
    fontSize: '36px',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  // Empty state
  emptyState: {
    textAlign: 'center',
    padding: '80px 32px',
  },
  emptyIcon: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: '#E6FBF0',
    color: '#00D26A',
    fontSize: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: '22px',
    marginBottom: '8px',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: '15px',
    lineHeight: '1.5',
  },
};
