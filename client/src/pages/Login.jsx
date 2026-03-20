// ============================================================================
// GigShield AI — Login Page
// ============================================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiShield, FiPhone, FiLock, FiArrowRight } from 'react-icons/fi';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(phone, password);
      navigate(user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gs-auth-wrapper">
      <div className="gs-auth-card gs-fade-in">
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'rgba(99,102,241,0.15)', marginBottom: '1rem' }}>
            <FiShield size={28} color="#6366f1" />
          </div>
          <h1>Welcome Back</h1>
          <p style={{ color: 'var(--gs-text-secondary)', fontSize: '0.9rem' }}>
            Sign in to your GigShield account
          </p>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--gs-danger-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: 'var(--gs-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="gs-label"><FiPhone size={12} style={{ marginRight: 4 }} /> Phone Number</label>
            <input type="tel" className="gs-input" placeholder="Enter 10-digit phone number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="gs-label"><FiLock size={12} style={{ marginRight: 4 }} /> Password</label>
            <input type="password" className="gs-input" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button type="submit" className="gs-btn gs-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
            {loading ? 'Signing in...' : <>Sign In <FiArrowRight /></>}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--gs-text-secondary)' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--gs-accent-light)', textDecoration: 'none', fontWeight: 600 }}>Register</Link>
        </p>

        {/* Quick login hints */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Demo Credentials</div>
          <div>Admin: 9999999999 / admin123</div>
          <div>Worker: 9876543210 / worker123</div>
        </div>
      </div>
    </div>
  );
}
