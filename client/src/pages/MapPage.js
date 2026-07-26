import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Default center: Southwest Florida (Fort Myers)
const DEFAULT_CENTER = [26.6406, -81.8723];
const DEFAULT_ZOOM = 14;

function createScooterIcon(battery) {
  const color = battery <= 20 ? '#F59E0B' : '#00D26A';
  return L.divIcon({
    className: 'scooter-marker',
    html: `<div style="
      width: 34px; height: 34px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: white; font-weight: bold; font-size: 13px;
    ">${battery}%</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const userIcon = L.divIcon({
  className: 'scooter-marker',
  html: `<div style="
    width: 20px; height: 20px;
    background: #3B82F6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(59,130,246,0.5);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function LocationMarker({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, DEFAULT_ZOOM);
    }
  }, [position, map]);

  return position ? (
    <>
      <Marker position={position} icon={userIcon} />
      <Circle center={position} radius={50} pathOptions={{ color: '#3B82F6', fillOpacity: 0.1, weight: 1 }} />
    </>
  ) : null;
}

export default function MapPage() {
  const [scooters, setScooters] = useState([]);
  const [userPos, setUserPos] = useState(null);
  const [selectedScooter, setSelectedScooter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const fetchScooters = useCallback(async () => {
    try {
      const data = await api.getScooters(
        userPos ? userPos[0] : DEFAULT_CENTER[0],
        userPos ? userPos[1] : DEFAULT_CENTER[1],
        5000
      );
      setScooters(data.scooters);
      // Keep the open scooter panel in sync with fresh data; close it if the
      // scooter is no longer available (rented/removed by someone else).
      setSelectedScooter(prev => {
        if (!prev) return prev;
        const updated = data.scooters.find(s => s.id === prev.id);
        return updated || null;
      });
    } catch (err) {
      setError('Failed to load scooters');
    } finally {
      setLoading(false);
    }
  }, [userPos]);

  useEffect(() => {
    // Try to get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        () => setUserPos(DEFAULT_CENTER),
        { timeout: 5000 }
      );
    } else {
      setUserPos(DEFAULT_CENTER);
    }
  }, []);

  useEffect(() => {
    fetchScooters();
    const interval = setInterval(fetchScooters, 15000);
    return () => clearInterval(interval);
  }, [fetchScooters]);

  const handleUnlock = async (scooter) => {
    setStarting(true);
    setError('');
    try {
      const pos = userPos || DEFAULT_CENTER;
      const result = await api.startRide(scooter.id, pos[0], pos[1]);
      if (result.user) updateUser(result.user);
      // Navigate away last; don't touch state afterwards since we unmount.
      navigate('/ride');
      return;
    } catch (err) {
      setError(err.message);
    }
    setStarting(false);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <span style={styles.logo}>Vim</span>
          <span style={styles.scooterCount}>{scooters.length} scooters nearby</span>
        </div>
        <div style={styles.balance}>${user?.balance?.toFixed(2)}</div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button onClick={() => setError('')} style={styles.errorClose}>x</button>
        </div>
      )}

      {/* Map */}
      <div style={styles.mapContainer}>
        {loading ? (
          <div style={styles.loadingMap}><div className="spinner" /></div>
        ) : (
          <MapContainer
            center={userPos || DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker position={userPos} />

            {scooters.map(scooter => (
              <Marker
                key={scooter.id}
                position={[scooter.latitude, scooter.longitude]}
                icon={createScooterIcon(scooter.battery_level)}
                eventHandlers={{
                  click: () => setSelectedScooter(scooter),
                }}
              >
                <Popup>
                  <div className="scooter-popup">
                    <h3>{scooter.code}</h3>
                    <p>{scooter.model} | {scooter.battery_level}% battery</p>
                    <p>${(scooter.unlock_fee || 0).toFixed(2)} to unlock + ${(scooter.price_per_minute || 0).toFixed(2)}/min</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Selected scooter panel */}
      {selectedScooter && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h3 style={styles.panelTitle}>{selectedScooter.code}</h3>
              <p style={styles.panelSubtitle}>{selectedScooter.model}</p>
            </div>
            <button onClick={() => setSelectedScooter(null)} style={styles.closeBtn}>x</button>
          </div>

          <div style={styles.panelStats}>
            <div style={styles.stat}>
              <span style={styles.statValue}>{selectedScooter.battery_level}%</span>
              <span style={styles.statLabel}>Battery</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>${selectedScooter.unlock_fee.toFixed(2)}</span>
              <span style={styles.statLabel}>Unlock</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>${selectedScooter.price_per_minute.toFixed(2)}</span>
              <span style={styles.statLabel}>Per min</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>
                {selectedScooter.distance != null ? `${Math.round(selectedScooter.distance)}m` : '--'}
              </span>
              <span style={styles.statLabel}>Away</span>
            </div>
          </div>

          <button
            onClick={() => handleUnlock(selectedScooter)}
            className="btn btn-primary"
            disabled={starting}
            style={{ marginTop: '12px' }}
          >
            {starting ? 'Unlocking...' : `Unlock Scooter - $${selectedScooter.unlock_fee.toFixed(2)}`}
          </button>
        </div>
      )}

      {/* Quick scan button */}
      {!selectedScooter && (
        <div style={styles.scanContainer}>
          <button onClick={fetchScooters} className="btn btn-primary" style={styles.refreshBtn}>
            Refresh Scooters
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 500,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 100%)',
    pointerEvents: 'none',
  },
  logo: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#00D26A',
    letterSpacing: '-1px',
    pointerEvents: 'auto',
  },
  scooterCount: {
    fontSize: '13px',
    color: '#6B7280',
    marginLeft: '12px',
  },
  balance: {
    background: '#1A1A2E',
    color: '#00D26A',
    padding: '6px 14px',
    borderRadius: '20px',
    fontWeight: '700',
    fontSize: '14px',
    pointerEvents: 'auto',
  },
  mapContainer: {
    flex: 1,
  },
  loadingMap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    background: '#E5E7EB',
  },
  panel: {
    position: 'absolute',
    bottom: '80px',
    left: '12px',
    right: '12px',
    background: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 500,
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  panelTitle: {
    fontSize: '20px',
    fontWeight: '700',
  },
  panelSubtitle: {
    fontSize: '14px',
    color: '#6B7280',
  },
  closeBtn: {
    background: '#F3F4F6',
    border: 'none',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    fontSize: '16px',
    cursor: 'pointer',
  },
  panelStats: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '16px',
    padding: '12px 0',
    borderTop: '1px solid #E5E7EB',
    borderBottom: '1px solid #E5E7EB',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: '700',
  },
  statLabel: {
    fontSize: '12px',
    color: '#6B7280',
    marginTop: '2px',
  },
  scanContainer: {
    position: 'absolute',
    bottom: '90px',
    left: '16px',
    right: '16px',
    zIndex: 500,
  },
  refreshBtn: {
    boxShadow: '0 4px 20px rgba(0,210,106,0.4)',
  },
  errorBanner: {
    position: 'absolute',
    top: '60px',
    left: '12px',
    right: '12px',
    zIndex: 600,
    background: '#FEE2E2',
    color: '#EF4444',
    padding: '12px 16px',
    borderRadius: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '18px',
    cursor: 'pointer',
  },
};
