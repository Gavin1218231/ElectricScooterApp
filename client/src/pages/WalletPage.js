import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const topUpAmounts = [5, 10, 20, 50];

export default function WalletPage() {
  const { user, updateUser } = useAuth();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const data = await api.getPayments();
      setPayments(data.payments);
      setSummary(data.summary);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    const amount = customAmount ? parseFloat(customAmount) : topUpAmount;
    if (!amount || amount <= 0) return;

    setProcessing(true);
    setMessage('');
    try {
      const data = await api.topUp(amount);
      updateUser(data.user);
      setMessage(data.message);
      setMessageType('success');
      setCustomAmount('');
      fetchPayments();
    } catch (err) {
      setMessage(err.message);
      setMessageType('error');
    } finally {
      setProcessing(false);
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
      {/* Balance card */}
      <div style={styles.balanceCard}>
        <p style={styles.balanceLabel}>Your Balance</p>
        <h1 style={styles.balanceAmount}>${user?.balance?.toFixed(2)}</h1>
        {summary && (
          <div style={styles.balanceStats}>
            <span>Total spent: ${summary.totalSpent.toFixed(2)}</span>
            <span>Total added: ${summary.totalAdded.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Top-up section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Add Funds</h3>

        {message && (
          <div className={messageType === 'success' ? 'success-message' : 'error-message'}>
            {message}
          </div>
        )}

        <div style={styles.amountGrid}>
          {topUpAmounts.map(amt => (
            <button
              key={amt}
              onClick={() => { setTopUpAmount(amt); setCustomAmount(''); }}
              style={{
                ...styles.amountBtn,
                ...(topUpAmount === amt && !customAmount ? styles.amountBtnActive : {}),
              }}
            >
              ${amt}
            </button>
          ))}
        </div>

        <div className="input-group" style={{ marginTop: '12px' }}>
          <input
            type="number"
            value={customAmount}
            onChange={e => { setCustomAmount(e.target.value); setTopUpAmount(0); }}
            placeholder="Or enter custom amount..."
            min="1"
            max="100"
            step="0.01"
          />
        </div>

        <button
          onClick={handleTopUp}
          className="btn btn-primary"
          disabled={processing}
        >
          {processing ? 'Processing...' : `Add $${customAmount || topUpAmount} to Wallet`}
        </button>
      </div>

      {/* Transaction history */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Transaction History</h3>

        {payments.length === 0 ? (
          <p style={styles.emptyText}>No transactions yet.</p>
        ) : (
          payments.map(payment => (
            <div key={payment.id} style={styles.transaction}>
              <div>
                <p style={styles.txDescription}>{payment.description}</p>
                <p style={styles.txDate}>{formatDate(payment.created_at)}</p>
              </div>
              <span style={{
                ...styles.txAmount,
                color: payment.amount > 0 ? '#00D26A' : '#EF4444',
              }}>
                {payment.amount > 0 ? '+' : ''}{payment.amount < 0 ? '-' : ''}${Math.abs(payment.amount).toFixed(2)}
              </span>
            </div>
          ))
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
  balanceCard: {
    background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
    color: 'white',
    padding: '32px 24px',
    textAlign: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    marginBottom: '4px',
  },
  balanceAmount: {
    fontSize: '48px',
    fontWeight: '800',
    color: '#00D26A',
    letterSpacing: '-2px',
  },
  balanceStats: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px',
    marginTop: '16px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
  },
  section: {
    padding: '20px 16px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '16px',
  },
  amountGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  },
  amountBtn: {
    padding: '14px',
    border: '2px solid #E5E7EB',
    borderRadius: '12px',
    background: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  amountBtnActive: {
    borderColor: '#00D26A',
    background: '#E6FBF0',
    color: '#00D26A',
  },
  transaction: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: 'white',
    borderRadius: '10px',
    marginBottom: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  txDescription: {
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '2px',
  },
  txDate: {
    fontSize: '12px',
    color: '#9CA3AF',
  },
  txAmount: {
    fontSize: '16px',
    fontWeight: '700',
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    padding: '24px',
  },
};
