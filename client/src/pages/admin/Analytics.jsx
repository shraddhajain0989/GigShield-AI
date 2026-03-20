// ============================================================================
// GigShield AI — Enhanced Admin Analytics (Chart.js + Real-Time)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { adminAPI } from '../../api';
import { usePolling } from '../../hooks/usePolling';
import { COLORS, GRADIENTS, LINE_OPTIONS, BAR_OPTIONS, DOUGHNUT_OPTIONS } from '../../utils/chartConfig';
import { FiUsers, FiFileText, FiAlertTriangle, FiDollarSign, FiTrendingUp, FiActivity, FiRefreshCw, FiShield, FiZap } from 'react-icons/fi';

export default function AdminAnalytics() {
  // ── Real-time polling (every 20s) ──
  const fetchAll = useCallback(async () => {
    const [o, r] = await Promise.allSettled([adminAPI.overview(), adminAPI.riskAnalytics()]);
    return {
      overview: o.status === 'fulfilled' ? o.value.data?.data : null,
      risk: r.status === 'fulfilled' ? r.value.data?.data : null,
    };
  }, []);

  const { data, loading, lastUpdated, refresh } = usePolling(fetchAll, 20000);
  const overview = data?.overview || {};
  const risk = data?.risk || {};

  // Extract nested data from overview
  const workers = overview.workers || {};
  const policies = overview.policies || {};
  const claims = overview.claims || {};
  // Assuming financials has total_revenue, if not fallback to policies.monthly_premium_revenue
  const revenue = overview.financials?.total_revenue || policies.monthly_premium_revenue || 0;
  const payouts = overview.financials?.total_payouts || claims.weekly_payout_amount || 0;

  // ── KPI Cards ──
  const kpis = [
    { label: 'Active Policies',    value: policies.active_policies || 0,        icon: <FiFileText />,       color: COLORS.success },
    { label: 'Claims This Week',   value: claims.claims_this_week || 0,         icon: <FiZap />,            color: COLORS.info },
    { label: 'Pending Reviews',    value: claims.pending_review || 0,           icon: <FiAlertTriangle />,  color: COLORS.danger },
    { label: 'Active Workers',     value: workers.total_active_workers || 0,    icon: <FiUsers />,          color: COLORS.accent },
    { label: 'Revenue (₹)',        value: `₹${Number(revenue).toLocaleString()}`, icon: <FiDollarSign />,     color: COLORS.warning },
    { label: 'Payouts (₹)',        value: `₹${Number(payouts).toLocaleString()}`, icon: <FiTrendingUp />,     color: COLORS.purple },
  ];

  // ── Chart: Claims & Fraud Trend (Daily) ──  
  const claimsTrend = risk.claims_trend || [];
  const defaultDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const trendLabels = claimsTrend.length > 0 ? claimsTrend.map(t => new Date(t.day).toLocaleDateString(undefined, { weekday: 'short' })) : defaultDays;
  
  const claimsTrendData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Claims',
        data: claimsTrend.length > 0 ? claimsTrend.map(t => t.total_claims) : defaultDays.map(() => 0),
        borderColor: COLORS.accent,
        backgroundColor: (ctx) => GRADIENTS.accent(ctx),
        fill: true,
      },
      {
        label: 'Fraud Flags',
        data: claimsTrend.length > 0 ? claimsTrend.map(t => t.fraud_flags) : defaultDays.map(() => 0),
        borderColor: COLORS.danger,
        backgroundColor: (ctx) => GRADIENTS.danger(ctx),
        fill: true,
      },
    ],
  };
  const trendOptions = {
    ...LINE_OPTIONS,
    plugins: { ...LINE_OPTIONS.plugins, legend: { display: true, position: 'top', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } } },
  };

  // ── Chart: Claims by Disruption Type (bar) ──
  const claimsByType = risk.claims_by_disruption || [];
  const typeBarData = {
    labels: claimsByType.map(t => t.disruption_type?.replace('_', ' ') || 'other'),
    datasets: [{
      label: 'Claims',
      data: claimsByType.map(t => t.total_claims || 0),
      backgroundColor: [COLORS.accent, COLORS.success, COLORS.warning, COLORS.danger, COLORS.info],
      borderRadius: 6,
    }],
  };

  // ── Chart: Policy Distribution (doughnut) ──
  const policyDoughnut = {
    labels: ['Active', 'Expired', 'Claimed', 'Cancelled'],
    datasets: [{
      data: [
        overview.policies?.active_policies || 0,
        overview.policies?.expired_policies || 0,
        overview.policies?.claimed_policies || 0,
        overview.policies?.cancelled_policies || 0,
      ],
      backgroundColor: [COLORS.success, COLORS.warning, COLORS.info, COLORS.danger],
      borderWidth: 0,
    }],
  };

  // ── Chart: Disruption Predictions (based on trigger trends) ──
  const triggerTrends = risk.trigger_trends || [];
  const predictionData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Rain Risk',
        data: trendLabels.map((_, i) => triggerTrends.filter(t => t.disruption_type === 'extreme_rain')[i]?.trigger_count || 0),
        borderColor: COLORS.info,
        backgroundColor: 'transparent',
      },
      {
        label: 'AQI Risk',
        data: trendLabels.map((_, i) => triggerTrends.filter(t => t.disruption_type === 'air_pollution')[i]?.trigger_count || 0),
        borderColor: COLORS.warning,
        backgroundColor: 'transparent',
      },
      {
        label: 'Flood Risk',
        data: trendLabels.map((_, i) => triggerTrends.filter(t => t.disruption_type === 'flood')[i]?.trigger_count || 0),
        borderColor: COLORS.danger,
        backgroundColor: 'transparent',
      },
    ],
  };
  const predictionOptions = {
    ...LINE_OPTIONS,
    plugins: { ...LINE_OPTIONS.plugins, legend: { display: true, position: 'top', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8, font: { size: 11 } } } },
  };

  return (
    <div className="gs-page gs-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="gs-page-title">System Analytics</h1>
          <p className="gs-page-subtitle">Real-time platform monitoring & disruption predictions</p>
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

      {/* ── KPI Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {kpis.map((k, i) => (
          <div key={i} className="gs-stat">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div className="gs-stat-value" style={{ fontSize: '1.3rem', background: 'none', WebkitTextFillColor: k.color, color: k.color }}>{k.value}</div>
                <div className="gs-stat-label" style={{ fontSize: '0.7rem' }}>{k.label}</div>
              </div>
              <div style={{ padding: 6, borderRadius: 8, background: `${k.color}15`, color: k.color, display: 'flex' }}>{k.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 1: Claims Trend + Policy Distribution ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiActivity style={{ marginRight: 8, color: COLORS.accent }} /> Claims & Fraud Trend</h3>
          <div style={{ height: 250 }}>
            <Line data={claimsTrendData} options={trendOptions} />
          </div>
        </div>

        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiShield style={{ marginRight: 8, color: COLORS.success }} /> Policy Distribution</h3>
          <div style={{ height: 250 }}>
            <Doughnut data={policyDoughnut} options={DOUGHNUT_OPTIONS} />
          </div>
        </div>
      </div>

      {/* ── Row 2: Claims by Type + Disruption Predictions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiZap style={{ marginRight: 8, color: COLORS.warning }} /> Claims by Disruption Type</h3>
          <div style={{ height: 250 }}>
            <Bar data={typeBarData} options={BAR_OPTIONS} />
          </div>
        </div>

        <div className="gs-card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}><FiTrendingUp style={{ marginRight: 8, color: COLORS.danger }} /> Disruption Predictions (7-Day)</h3>
          <div style={{ height: 250 }}>
            <Line data={predictionData} options={predictionOptions} />
          </div>
        </div>
      </div>

      {/* ── Row 3: Top Risk Zones ── */}
      <div className="gs-card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem' }}>🗺️ Top Risk Zones</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {(risk.high_risk_zones || []).slice(0, 6).map((z, i) => {
            const riskPct = (parseFloat(z.risk_score) * 100).toFixed(0);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid var(--gs-border)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', background: parseFloat(z.risk_score) > 0.7 ? 'var(--gs-danger-bg)' : parseFloat(z.risk_score) > 0.4 ? 'var(--gs-warning-bg)' : 'var(--gs-success-bg)', color: parseFloat(z.risk_score) > 0.7 ? COLORS.danger : parseFloat(z.risk_score) > 0.4 ? COLORS.warning : COLORS.success }}>
                  {riskPct}%
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{z.zone_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>{z.city}</div>
                </div>
                <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--gs-border)' }}>
                  <div style={{ width: `${riskPct}%`, height: '100%', borderRadius: 3, background: parseFloat(z.risk_score) > 0.7 ? COLORS.danger : parseFloat(z.risk_score) > 0.4 ? COLORS.warning : COLORS.success }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
