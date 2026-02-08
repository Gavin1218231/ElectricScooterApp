import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/', label: 'Map', icon: 'M' },
  { path: '/ride', label: 'Ride', icon: 'R' },
  { path: '/history', label: 'History', icon: 'H' },
  { path: '/wallet', label: 'Wallet', icon: 'W' },
  { path: '/profile', label: 'Profile', icon: 'P' },
];

const adminItems = [
  ...navItems,
  { path: '/admin', label: 'Admin', icon: 'A' },
];

export default function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const items = user?.role === 'admin' ? adminItems : navItems;

  return (
    <nav style={styles.nav}>
      {items.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          style={() => ({
            ...styles.link,
            ...(location.pathname === item.path ? styles.activeLink : {}),
          })}
        >
          <span style={{
            ...styles.icon,
            ...(location.pathname === item.path ? styles.activeIcon : {}),
          }}>
            {item.icon}
          </span>
          <span style={styles.label}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'white',
    display: 'flex',
    justifyContent: 'space-around',
    padding: '8px 0 20px',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
    zIndex: 1000,
  },
  link: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textDecoration: 'none',
    color: '#6B7280',
    fontSize: '11px',
    gap: '4px',
    padding: '4px 12px',
  },
  activeLink: {
    color: '#00D26A',
  },
  icon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '700',
    background: '#F3F4F6',
    color: '#6B7280',
  },
  activeIcon: {
    background: '#E6FBF0',
    color: '#00D26A',
  },
  label: {
    fontWeight: '600',
  },
};
