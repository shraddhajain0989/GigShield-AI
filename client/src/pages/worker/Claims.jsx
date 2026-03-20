// ============================================================================
// GigShield AI — Worker Claims History
// ============================================================================

import { useState, useEffect } from 'react';
import { claimAPI } from '../../api';
import { FiClock, FiCheckCircle, FiXCircle, FiEye, FiAlertTriangle } from 'react-icons/fi';

export default function Claims() {
  const [claims, setClaims] = useState([]);
  const [selected, setSelected] = useState(null);
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

  const statusIcon = (s) => {
    if (s === 'auto_approved' || s === 'approved') return <FiCheckCircle color="#10b981" />;
    if (s === 'blocked' || s === 'rejected') return <FiXCircle color="#ef4444" />;
    if (s === 'under_review') return <FiEye color="#f59e0b" />;
    return <FiClock color="#06b6d4" />;
  };

  const statusBadge = (s) => {
    const map = { auto_approved: 'success', approved: 'success', blocked: 'danger', rejected: 'danger', under_review: 'warning', pending: 'info' };
    return <span className={`gs-badge gs-badge-${map[s] || 'accent'}`}>{statusIcon(s)} {s?.replace('_', ' ')}</span>;
  };

  return (
    <div className="gs-page gs-fade-in">
      <h1 className="gs-page-title">Claim History</h1>
      <p className="gs-page-subtitle">Track auto-triggered insurance claims and payouts</p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total Claims', value: claims.length, color: 'var(--gs-accent-light)' },
          { label: 'Approved', value: claims.filter(c => c.status === 'auto_approved' || c.status === 'approved').length, color: 'var(--gs-success)' },
          { label: 'Pending', value: claims.filter(c => c.status === 'pending' || c.status === 'under_review').length, color: 'var(--gs-warning)' },
          { label: 'Total Received', value: '₹' + claims.filter(c => c.status === 'auto_approved' || c.status === 'approved').reduce((s, c) => s + parseFloat(c.claim_amount || 0), 0).toLocaleString(), color: 'var(--gs-success)' },
        ].map((s, i) => (
          <div key={i} className="gs-stat">
            <div className="gs-stat-value" style={{ fontSize: '1.5rem', background: 'none', WebkitTextFillColor: s.color, color: s.color }}>{s.value}</div>
            <div className="gs-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Claims table */}
      {claims.length > 0 ? (
        <div className="gs-card">
          <table className="gs-table">
            <thead>
              <tr>
                <th>Claim #</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Fraud Score</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.claim_number}</td>
                  <td>{c.disruption_type?.replace('_', ' ')}</td>
                  <td style={{ fontWeight: 600 }}>₹{c.claim_amount}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--gs-border)' }}>
                        <div style={{ width: `${(c.fraud_score || 0) * 100}%`, height: '100%', borderRadius: 3, background: (c.fraud_score || 0) > 0.8 ? '#ef4444' : (c.fraud_score || 0) > 0.3 ? '#f59e0b' : '#10b981' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>{((c.fraud_score || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>
                    <button className="gs-btn gs-btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setSelected(selected?.id === c.id ? null : c)}>
                      <FiEye size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="gs-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <FiClock size={48} color="var(--gs-text-muted)" />
          <p style={{ color: 'var(--gs-text-muted)', marginTop: '1rem' }}>No claims yet. Claims are auto-triggered when disruptions occur.</p>
        </div>
      )}

      {/* Claim detail modal */}
      {selected && (
        <div className="gs-card" style={{ marginTop: '1.5rem', border: '1px solid var(--gs-accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>Claim Details</h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--gs-text-muted)', cursor: 'pointer' }}><FiXCircle size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Claim #:</span> {selected.claim_number}</div>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Status:</span> {statusBadge(selected.status)}</div>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Amount:</span> <strong>₹{selected.claim_amount}</strong></div>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Fraud Score:</span> {((selected.fraud_score || 0) * 100).toFixed(1)}%</div>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Type:</span> {selected.disruption_type?.replace('_', ' ')}</div>
            <div><span style={{ color: 'var(--gs-text-muted)' }}>Date:</span> {new Date(selected.created_at).toLocaleString()}</div>
          </div>
          {selected.evidence && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--gs-text-secondary)' }}>Evidence</div>
              <pre style={{ color: 'var(--gs-text-muted)', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                {typeof selected.evidence === 'string' ? selected.evidence : JSON.stringify(selected.evidence, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
