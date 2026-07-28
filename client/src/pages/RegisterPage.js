import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.name, form.phone);
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
        <p style={styles.tagline}>Join the ride</p>
      </div>

      <div style={styles.form}>
        <h2 style={styles.title}>Create Account</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Full Name</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" required />
          </div>

          <div className="input-group">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
          </div>

          <div className="input-group">
            <label>Phone (optional)</label>
            <input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="+1-555-0123" />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="At least 8 characters" required minLength={8} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Get Started'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
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
    padding: '40px 20px 30px',
    textAlign: 'center',
  },
  logo: {
    fontSize: '48px',
    fontWeight: '800',
    color: '#00D26A',
    letterSpacing: '-2px',
  },
  tagline: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '16px',
    marginTop: '4px',
  },
  form: {
    background: 'white',
    borderRadius: '24px 24px 0 0',
    padding: '32px 24px',
    minHeight: '70vh',
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
};
