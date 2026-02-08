import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.logo}>Vim</div>
        <p style={styles.tagline}>Unlock the city</p>
      </div>

      <div style={styles.form}>
        <h2 style={styles.title}>Welcome back</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          New to Vim? <Link to="/register">Create an account</Link>
        </p>

        <div style={styles.demo}>
          <p style={styles.demoTitle}>Demo Accounts:</p>
          <p style={styles.demoText}>rider@vim.rides / password123</p>
          <p style={styles.demoText}>admin@vim.rides / admin123</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
  },
  hero: {
    padding: '60px 20px 40px',
    textAlign: 'center',
  },
  logo: {
    fontSize: '64px',
    fontWeight: '800',
    color: '#00D26A',
    letterSpacing: '-2px',
  },
  tagline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '18px',
    marginTop: '8px',
  },
  form: {
    background: 'white',
    borderRadius: '24px 24px 0 0',
    padding: '32px 24px',
    minHeight: '60vh',
  },
  title: {
    fontSize: '24px',
    marginBottom: '24px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '24px',
    color: '#6B7280',
    fontSize: '14px',
  },
  demo: {
    marginTop: '24px',
    padding: '16px',
    background: '#F3F4F6',
    borderRadius: '12px',
  },
  demoTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: '4px',
  },
  demoText: {
    fontSize: '13px',
    color: '#6B7280',
    fontFamily: 'monospace',
  },
};
