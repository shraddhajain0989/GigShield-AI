// ============================================================================
// GigShield AI — Admin Claims Monitor
// ============================================================================

import { useState, useEffect } from 'react';
import { adminAPI, claimAPI } from '../../api';
import { FiCheck, FiX, FiEye, FiRefreshCw, FiFilter, FiDownload, FiPlay } from 'react-icons/fi';

export default function ClaimsMonitor() {
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadClaims(); }, [filter]);

  async function loadClaims() {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await adminAPI.claims(params);
      setClaims(data.data?.claims || []);
    } catch (err) { /* graceful */ }
    setLoading(false);
  }

  const handleReview = async (claimId, action) => {
    try {
      const payload = {
        status: action === 'approve' ? 'approved' : 'rejected',
        review_notes: action === 'approve' ? 'Admin approved' : 'Admin rejected',
      };
      await claimAPI.review(claimId, payload);
      loadClaims();
    } catch (err) { /* graceful */ }
  };

  const handleForceScan = async () => {
    setLoading(true);
    try {
      await adminAPI.triggerScan();
      loadClaims();
    } catch (err) { /* graceful */ }
    setLoading(false);
  };

  const handleExportCSV = () => {
    if (claims.length === 0) return;
    const headers = ['Claim #', 'Worker', 'Type', 'Amount', 'Fraud Score', 'Date', 'Status'];
    const rows = claims.map(c => [
      c.claim_number,
      c.worker_name || 'N/A',
      c.disruption_type,
      c.claim_amount,
      c.fraud_score,
      new Date(c.created_at).toLocaleDateString(),
      c.status
    ]);
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'claims_export.csv';
    link.click();
  };

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'auto_approved', label: 'Approved' },
    { value: 'blocked', label: 'Blocked' },
  ];

  const statusColor = (s) => {
    const map = { auto_approved: 'success', approved: 'success', blocked: 'danger', under_review: 'warning', pending: 'info' };
    return map[s] || 'accent';
  };

  return (
    <div className="gs-page gs-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="gs-page-title">Claims Monitor</h1>
          <p className="gs-page-subtitle">Real-time claim tracking and review</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="gs-btn gs-btn-primary" onClick={handleForceScan} disabled={loading}>
            <FiPlay size={14} /> {loading ? 'Scanning...' : 'Force Env Scan'}
          </button>
          <button className="gs-btn gs-btn-outline" onClick={handleExportCSV}>
            <FiDownload size={14} /> Export CSV
          </button>
          <button className="gs-btn gs-btn-outline" onClick={loadClaims}>
            <FiRefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {filters.map(f => (
          <button key={f.value} className={`gs-btn ${filter === f.value ? 'gs-btn-primary' : 'gs-btn-outline'}`} style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--gs-text-muted)' }}>
        <div className="gs-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gs-success)' }} />
        {claims.length} claims · Last updated: {new Date().toLocaleTimeString()}
      </div>

      {/* Claims table */}
      <div className="gs-card">
        <table className="gs-table">
          <thead>
            <tr>
              <th>Claim #</th>
              <th>Worker</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Fraud Score</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.claim_number}</td>
                <td style={{ fontSize: '0.85rem' }}>{c.worker_name || '—'}</td>
                <td style={{ fontSize: '0.85rem' }}>{c.disruption_type?.replace('_', ' ')}</td>
                <td style={{ fontWeight: 600 }}>₹{c.claim_amount}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 50, height: 6, borderRadius: 3, background: 'var(--gs-border)' }}>
                      <div style={{ width: `${(c.fraud_score || 0) * 100}%`, height: '100%', borderRadius: 3, background: (c.fraud_score || 0) > 0.8 ? '#ef4444' : (c.fraud_score || 0) > 0.3 ? '#f59e0b' : '#10b981' }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: (c.fraud_score || 0) > 0.8 ? '#ef4444' : (c.fraud_score || 0) > 0.3 ? '#f59e0b' : '#10b981' }}>
                      {((c.fraud_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                <td><span className={`gs-badge gs-badge-${statusColor(c.status)}`}>{c.status?.replace('_', ' ')}</span></td>
                <td>
                  {(c.status === 'under_review' || c.status === 'pending') && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="gs-btn gs-btn-success" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleReview(c.id, 'approve')} title="Approve">
                        <FiCheck size={12} />
                      </button>
                      <button className="gs-btn gs-btn-danger" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleReview(c.id, 'reject')} title="Reject">
                        <FiX size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {claims.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gs-text-muted)' }}>No claims found</div>}
      </div>
    </div>
  );
}
