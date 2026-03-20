// ============================================================================
// GigShield AI — Earnings Protected Page
// ============================================================================

import { useState, useEffect } from 'react';
import { claimAPI, policyAPI } from '../../api';
import { FiDollarSign, FiTrendingUp, FiShield, FiCalendar } from 'react-icons/fi';

export default function Earnings() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await claimAPI.list({});
        setClaims(data.data?.claims || []);
      } catch (err) { /* graceful */ }
      setLoading(false);
    }
    load();
  }, []);

  const approved = claims.filter(c => c.status === 'auto_approved' || c.status === 'approved');
  const totalProtected = approved.reduce((s, c) => s + parseFloat(c.claim_amount || 0), 0);
  const premiumsPaid = claims.length * 60; // approximate

  // Group by month
  const byMonth = {};
  approved.forEach(c => {
    const m = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    byMonth[m] = (byMonth[m] || 0) + parseFloat(c.claim_amount || 0);
  });

  return (
    <div className="gs-page gs-fade-in">
      <h1 className="gs-page-title">Earnings Protected</h1>
      <p className="gs-page-subtitle">Income covered by GigShield insurance</p>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="gs-stat">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="gs-stat-value">₹{totalProtected.toLocaleString()}</div>
              <div className="gs-stat-label">Total Protected</div>
            </div>
            <div style={{ padding: 8, borderRadius: 10, background: 'rgba(16,185,129,0.15)' }}>
              <FiDollarSign size={20} color="#10b981" />
            </div>
          </div>
        </div>

        <div className="gs-stat">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="gs-stat-value">{approved.length}</div>
              <div className="gs-stat-label">Payouts Received</div>
            </div>
            <div style={{ padding: 8, borderRadius: 10, background: 'rgba(99,102,241,0.15)' }}>
              <FiTrendingUp size={20} color="#6366f1" />
            </div>
          </div>
        </div>

        <div className="gs-stat">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="gs-stat-value">{totalProtected > 0 ? `${((totalProtected / Math.max(premiumsPaid, 1)) * 100).toFixed(0)}%` : '—'}</div>
              <div className="gs-stat-label">Protection ROI</div>
            </div>
            <div style={{ padding: 8, borderRadius: 10, background: 'rgba(245,158,11,0.15)' }}>
              <FiShield size={20} color="#f59e0b" />
            </div>
          </div>
        </div>
      </div>

      {/* Monthly breakdown */}
      <div className="gs-card">
        <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}><FiCalendar style={{ marginRight: 8 }} /> Monthly Breakdown</h3>
        {Object.keys(byMonth).length > 0 ? (
          <div>
            {Object.entries(byMonth).map(([month, amount]) => (
              <div key={month} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '12px 0', borderBottom: '1px solid var(--gs-border)' }}>
                <span style={{ width: 100, fontSize: '0.85rem', color: 'var(--gs-text-secondary)' }}>{month}</span>
                <div style={{ flex: 1, height: 24, background: 'var(--gs-border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (amount / Math.max(totalProtected, 1)) * 100)}%`, height: '100%', background: 'var(--gs-premium-gradient)', borderRadius: 6, transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', minWidth: 80, textAlign: 'right' }}>₹{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--gs-text-muted)', textAlign: 'center', padding: '2rem 0' }}>No payouts yet. Your earnings will appear here when claims are processed.</p>
        )}
      </div>

      {/* Payout timeline */}
      {approved.length > 0 && (
        <div className="gs-card" style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>💰 Payout Timeline</h3>
          {approved.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', padding: '12px 0', borderBottom: i < approved.length - 1 ? '1px solid var(--gs-border)' : 'none' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gs-success)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>₹{c.claim_amount} — {c.disruption_type?.replace('_', ' ')}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>{new Date(c.created_at).toLocaleString()}</div>
              </div>
              <span className="gs-badge gs-badge-success">Paid</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
