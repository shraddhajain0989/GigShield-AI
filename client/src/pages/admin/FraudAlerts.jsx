// ============================================================================
// GigShield AI — Admin Fraud Alerts Page
// ============================================================================

import { useState, useEffect } from 'react';
import { adminAPI } from '../../api';
import { FiAlertTriangle, FiShield, FiMapPin, FiSmartphone, FiWifi, FiClock } from 'react-icons/fi';

export default function FraudAlerts() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await adminAPI.claims({ status: 'blocked' });
        const blocked = data.data?.claims || [];
        const { data: d2 } = await adminAPI.claims({ status: 'under_review' });
        const review = d2.data?.claims || [];
        setClaims([...blocked, ...review].sort((a, b) => (b.fraud_score || 0) - (a.fraud_score || 0)));
      } catch (err) { /* graceful */ }
      setLoading(false);
    }
    load();
  }, []);

  const flagIcon = (type) => {
    const map = { gps_spoofing: <FiMapPin />, impossible_speed: <FiClock />, device_anomaly: <FiSmartphone />, ip_anomaly: <FiWifi />, suspicious_pattern: <FiAlertTriangle />, claim_frequency: <FiClock />, timing_anomaly: <FiClock /> };
    return map[type] || <FiAlertTriangle />;
  };

  return (
    <div className="gs-page gs-fade-in">
      <h1 className="gs-page-title">🛡️ Fraud Alerts</h1>
      <p className="gs-page-subtitle">AI-flagged claims requiring human review</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="gs-stat">
          <div className="gs-stat-value" style={{ fontSize: '1.5rem', background: 'none', WebkitTextFillColor: '#ef4444', color: '#ef4444' }}>
            {claims.filter(c => c.status === 'blocked').length}
          </div>
          <div className="gs-stat-label">Auto-Blocked</div>
        </div>
        <div className="gs-stat">
          <div className="gs-stat-value" style={{ fontSize: '1.5rem', background: 'none', WebkitTextFillColor: '#f59e0b', color: '#f59e0b' }}>
            {claims.filter(c => c.status === 'under_review').length}
          </div>
          <div className="gs-stat-label">Needs Review</div>
        </div>
        <div className="gs-stat">
          <div className="gs-stat-value" style={{ fontSize: '1.5rem', background: 'none', WebkitTextFillColor: '#6366f1', color: '#6366f1' }}>
            {claims.length > 0 ? (claims.reduce((s, c) => s + (c.fraud_score || 0), 0) / claims.length * 100).toFixed(0) + '%' : '—'}
          </div>
          <div className="gs-stat-label">Avg Fraud Score</div>
        </div>
      </div>

      {/* Fraud cards */}
      {claims.map(c => (
        <div key={c.id} className="gs-card" style={{ marginBottom: '1rem', borderLeft: `4px solid ${c.status === 'blocked' ? '#ef4444' : '#f59e0b'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Claim {c.claim_number}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gs-text-muted)' }}>{c.worker_name} · {c.disruption_type?.replace('_', ' ')} · ₹{c.claim_amount}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: (c.fraud_score || 0) > 0.8 ? '#ef4444' : '#f59e0b' }}>
                {((c.fraud_score || 0) * 100).toFixed(0)}%
              </div>
              <span className={`gs-badge gs-badge-${c.status === 'blocked' ? 'danger' : 'warning'}`}>{c.status?.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Fraud flags */}
          {c.fraud_flags && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(typeof c.fraud_flags === 'string' ? JSON.parse(c.fraud_flags) : c.fraud_flags || []).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: '0.75rem', color: 'var(--gs-danger)' }}>
                  {flagIcon(f.flag_type)} {f.flag_type?.replace('_', ' ')} ({(f.confidence * 100).toFixed(0)}%)
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {claims.length === 0 && !loading && (
        <div className="gs-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <FiShield size={48} color="var(--gs-success)" />
          <p style={{ color: 'var(--gs-text-muted)', marginTop: '1rem' }}>No fraud alerts. All clear! 🎉</p>
        </div>
      )}
    </div>
  );
}
