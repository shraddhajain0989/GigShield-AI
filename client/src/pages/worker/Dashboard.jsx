// ============================================================================
// GigShield AI — Enhanced Worker Dashboard (Chart.js + Real-Time)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Line, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../../context/AuthContext';
import { policyAPI, claimAPI, userAPI } from '../../api';
import { usePolling } from '../../hooks/usePolling';
import { COLORS, GRADIENTS, LINE_OPTIONS, DOUGHNUT_OPTIONS } from '../../utils/chartConfig';
import { FiShield, FiZap, FiDollarSign, FiAlertTriangle, FiArrowRight, FiCheckCircle, FiClock, FiActivity, FiRefreshCw } from 'react-icons/fi';

export default function Dashboard() {
  const { user } = useAuth();

  // ── Real-time polling (every 30s) ──
  const fetchDashboard = useCallback(async () => {
    const [policyRes, claimsRes, analyticsRes] = await Promise.allSettled([
      policyAPI.getActive(),
      claimAPI.list({ limit: 20 }),
      userAPI.getAnalytics(),
    ]);
    const activePolicy = policyRes.status === 'fulfilled' ? policyRes.value.data?.data?.policies?.[0] : null;
    const claims = claimsRes.status === 'fulfilled' ? (claimsRes.value.data?.data?.claims || []) : [];
    const analytics = analyticsRes.status === 'fulfilled' ? (analyticsRes.value.data?.data || {}) : { risk_trend: [], earnings_trend: [] };

    const approved = claims.filter(c => c.status === 'auto_approved' || c.status === 'approved' || c.status === 'paid');
    const totalProtected = approved.reduce((s, c) => s + parseFloat(c.claim_amount || 0), 0);
    
    return { activePolicy, claims, approved, totalProtected, analytics };
  }, []);

  const { data, loading, lastUpdated, refresh } = usePolling(fetchDashboard, 30000);
  const stats = data || { activePolicy: null, claims: [], approved: [], totalProtected: 0, analytics: { risk_trend: [], earnings_trend: [] } };
  const analytics = stats.analytics;

  // ── Chart: Weekly Risk Level (Real Data) ──
  const riskLabels = analytics.risk_trend.length > 0 
    ? analytics.risk_trend.map(t => new Date(t.day).toLocaleDateString(undefined, { weekday: 'short' })) 
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  const coverageData = {
    labels: riskLabels,
    datasets: [{
      label: 'Risk Level',
      data: analytics.risk_trend.length > 0 
        ? analytics.risk_trend.map(t => (t.risk_level || 0).toFixed(2)) 
        : riskLabels.map(() => 0),
      borderColor: COLORS.accent,
      backgroundColor: (ctx) => GRADIENTS.accent(ctx),
      fill: true,
    }],
  };

  // ── Chart: Claims by Type Doughnut ──
  const claimTypes = {};
  stats.claims.forEach(c => { claimTypes[c.disruption_type || 'other'] = (claimTypes[c.disruption_type || 'other'] || 0) + 1; });
  const doughnutData = {
    labels: Object.keys(claimTypes).map(t => t.replace('_', ' ')),
    datasets: [{
      data: Object.values(claimTypes),
      backgroundColor: [COLORS.accent, COLORS.success, COLORS.warning, COLORS.danger, COLORS.info, COLORS.purple],
      borderWidth: 0,
    }],
  };

  // ── Chart: Earnings Timeline (Real Data) ──
  const earningsLabels = analytics.earnings_trend.length > 0
    ? analytics.earnings_trend.map(t => new Date(t.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    : ['W1', 'W2', 'W3', 'W4'];

  const earningsLineData = {
    labels: earningsLabels,
    datasets: [{
      label: 'Earnings Protected (₹)',
      data: analytics.earnings_trend.length > 0 
        ? analytics.earnings_trend.map(t => t.amount) 
        : earningsLabels.map(() => 0),
      borderColor: COLORS.success,
      backgroundColor: (ctx) => GRADIENTS.success(ctx),
      fill: true,
    }],
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  };

  return (
    <div className="gs-page gs-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="gs-page-title">{greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="gs-page-subtitle">Real-time insurance dashboard</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>
            <div className="gs-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gs-success)' }} />
            Live {lastUpdated && `· ${lastUpdated.toLocaleTimeString()}`}
          </div>
          <button className="gs-btn gs-btn-outline" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={refresh}>
            <FiRefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Weekly Coverage', value: stats.activePolicy ? 'Active' : 'None', icon: <FiShield />, color: stats.activePolicy ? COLORS.success : COLORS.warning, bg: stats.activePolicy ? 'var(--gs-success-bg)' : 'var(--gs-warning-bg)' },
          { label: 'Claims Triggered', value: stats.claims.length, icon: <FiZap />, color: COLORS.info, bg: 'var(--gs-info-bg)' },
          { label: 'Earnings Protected', value: `₹${stats.totalProtected.toLocaleString()}`, icon: <FiDollarSign />, color: COLORS.accent, bg: 'rgba(99,102,241,0.1)' },
          { label: 'Risk Alerts', value: stats.claims.filter(c => c.status === 'pending' || c.status === 'under_review').length, icon: <FiAlertTriangle />, color: COLORS.warning, bg: 'var(--gs-warning-bg)' },
        ].map((k, i) => (
          <div key={i} className="gs-stat">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div className="gs-stat-value" style={{ fontSize: '1.5rem', background: 'none', WebkitTextFillColor: k.color, color: k.color }}>{k.value}</div>
                <div className="gs-stat-label">{k.label}</div>
              </div>
              <div style={{ padding: 8, borderRadius: 10, background: k.bg }}>{k.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Weekly Risk & Coverage */}
        <div className="gs-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}><FiActivity style={{ marginRight: 8, color: COLORS.accent }} /> Weekly Risk Level</h3>
            <span className="gs-badge gs-badge-accent">This Week</span>
          </div>
          <div style={{ height: 220 }}>
            <Line data={coverageData} options={LINE_OPTIONS} />
          </div>
        </div>

        {/* Claims by Type */}
        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiZap style={{ marginRight: 8, color: COLORS.info }} /> Claims by Type</h3>
          <div style={{ height: 220 }}>
            {stats.claims.length > 0 ? (
              <Doughnut data={doughnutData} options={DOUGHNUT_OPTIONS} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gs-text-muted)', fontSize: '0.85rem' }}>No claims data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Earnings Chart + Active Policy ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Earnings Line */}
        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiDollarSign style={{ marginRight: 8, color: COLORS.success }} /> Earnings Protected</h3>
          <div style={{ height: 200 }}>
            <Line data={earningsLineData} options={LINE_OPTIONS} />
          </div>
        </div>

        {/* Active Policy Card */}
        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiShield style={{ marginRight: 8, color: COLORS.accent }} /> Active Policy</h3>
          {stats.activePolicy ? (
            <div>
              {[
                { label: 'Coverage', value: <span className="gs-badge gs-badge-accent">{stats.activePolicy.coverage_tier}</span> },
                { label: 'Disruption', value: stats.activePolicy.disruption_type?.replace('_', ' ') },
                { label: 'Premium', value: <strong>₹{stats.activePolicy.premium_amount}</strong> },
                { label: 'Payout', value: <strong style={{ color: COLORS.success }}>₹{stats.activePolicy.payout_amount}</strong> },
                { label: 'Valid', value: `${new Date(stats.activePolicy.week_start).toLocaleDateString()} – ${new Date(stats.activePolicy.week_end).toLocaleDateString()}` },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--gs-border)' : 'none', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--gs-text-muted)' }}>{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p style={{ color: 'var(--gs-text-muted)', marginBottom: '1rem' }}>No active policy</p>
              <Link to="/policies" className="gs-btn gs-btn-primary"><FiArrowRight /> Buy Policy</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Claims with Risk Alerts ── */}
      <div className="gs-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}><FiClock style={{ marginRight: 8, color: COLORS.info }} /> Recent Claims & Alerts</h3>
          <Link to="/claims" style={{ fontSize: '0.8rem', color: 'var(--gs-accent-light)', textDecoration: 'none' }}>View all →</Link>
        </div>
        {stats.claims.length > 0 ? (
          <table className="gs-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Fraud</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.claims.slice(0, 5).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.85rem' }}>{c.disruption_type?.replace('_', ' ')}</td>
                  <td style={{ fontWeight: 600 }}>₹{c.claim_amount}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--gs-border)' }}>
                        <div style={{ width: `${(c.fraud_score || 0) * 100}%`, height: '100%', borderRadius: 3, background: (c.fraud_score || 0) > 0.8 ? COLORS.danger : (c.fraud_score || 0) > 0.3 ? COLORS.warning : COLORS.success }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--gs-text-muted)' }}>{((c.fraud_score || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`gs-badge gs-badge-${c.status === 'auto_approved' || c.status === 'approved' ? 'success' : c.status === 'blocked' ? 'danger' : 'warning'}`}>
                      {c.status === 'auto_approved' ? <><FiCheckCircle size={10} /> Paid</> : c.status?.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--gs-text-muted)' }}>No claims yet. Claims are auto-triggered when disruptions occur in your zone.</p>
        )}
      </div>
    </div>
  );
}
