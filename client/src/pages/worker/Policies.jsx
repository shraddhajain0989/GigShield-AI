// ============================================================================
// GigShield AI — Worker Policies Page (Buy + View)
// ============================================================================

import { useState, useEffect } from 'react';
import { policyAPI, userAPI, paymentAPI } from '../../api';
import { FiShield, FiPlus, FiX, FiCheck, FiMapPin } from 'react-icons/fi';

const DISRUPTION_TYPES = [
  { value: 'extreme_rain', label: '🌧️ Extreme Rain', desc: 'Heavy rainfall > 70mm' },
  { value: 'flood',        label: '🌊 Flood',        desc: 'Government flood warning' },
  { value: 'air_pollution',label: '🌫️ Air Pollution', desc: 'AQI > 300 (hazardous)' },
  { value: 'extreme_heat', label: '🔥 Extreme Heat', desc: 'Temperature > 42°C' },
  { value: 'curfew',       label: '🚫 Curfew',       desc: 'Section 144 imposed' },
];

const COVERAGE_TIERS = [
  { value: 'basic',    label: 'Basic',    payout: '₹500',  premium: '~₹30-50',  color: '#06b6d4' },
  { value: 'standard', label: 'Standard', payout: '₹1,000', premium: '~₹50-80',  color: '#6366f1' },
  { value: 'premium',  label: 'Premium',  payout: '₹2,000', premium: '~₹80-120', color: '#f59e0b' },
];

export default function Policies() {
  const [policies, setPolicies] = useState([]);
  const [showBuy, setShowBuy] = useState(false);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({ zone_id: '', disruption_type: 'extreme_rain', coverage_tier: 'standard' });
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPolicies();
    loadZones();
  }, []);

  async function loadPolicies() {
    try {
      const { data } = await policyAPI.list({});
      setPolicies(data.data?.policies || []);
    } catch (err) { /* graceful */ }
  }

  async function loadZones() {
    try {
      const { data } = await userAPI.listZones();
      setZones(data.data?.zones || []);
    } catch (err) { /* graceful */ }
  }

  const handleBuy = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // First assign the worker to the selected zone
      await userAPI.selectZone({ zone_id: form.zone_id });
      // Then create the policy & generate Razorpay Order
      const res = await policyAPI.create(form);
      const { razorpay_order_id, amount, key_id, policy } = res.data.data;
      
      const options = {
        key: key_id,
        amount: Math.round(amount * 100),
        currency: "INR",
        name: "GigShield AI",
        description: "Weekly Parametric Policy Premium",
        order_id: razorpay_order_id,
        handler: async function (response) {
          try {
            await paymentAPI.verifyPremium({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              policy_id: policy.id
            });
            setShowBuy(false);
            setForm({ zone_id: '', disruption_type: 'extreme_rain', coverage_tier: 'standard' });
            loadPolicies();
          } catch (err) {
            setError(err.response?.data?.message || 'Payment verification failed.');
          }
        },
        theme: { color: "#4f46e5" }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
        setError("Payment Failed: " + response.error.description);
      });
      rzp.open();
      setForm({ zone_id: '', disruption_type: 'extreme_rain', coverage_tier: 'standard' });
      setQuote(null);
      loadPolicies();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to purchase policy');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status) => {
    const map = { active: 'success', expired: 'warning', cancelled: 'danger', claimed: 'info' };
    return <span className={`gs-badge gs-badge-${map[status] || 'accent'}`}>{status}</span>;
  };

  return (
    <div className="gs-page gs-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="gs-page-title">My Policies</h1>
          <p className="gs-page-subtitle">Weekly parametric insurance coverage</p>
        </div>
        <button className="gs-btn gs-btn-primary" onClick={() => setShowBuy(!showBuy)}>
          {showBuy ? <><FiX /> Cancel</> : <><FiPlus /> Buy Policy</>}
        </button>
      </div>

      {/* Buy Policy Form */}
      {showBuy && (
        <div className="gs-card" style={{ marginBottom: '2rem', border: '1px solid var(--gs-accent)', background: 'rgba(99,102,241,0.03)' }}>
          <h3 style={{ marginBottom: '1.25rem', fontWeight: 600 }}><FiShield style={{ marginRight: 8 }} /> Buy Weekly Policy</h3>

          {error && <div style={{ padding: 10, background: 'var(--gs-danger-bg)', borderRadius: 8, color: 'var(--gs-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

          <form onSubmit={handleBuy}>
            {/* Zone selector */}
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label"><FiMapPin size={12} /> Delivery Zone</label>
              <select className="gs-input" value={form.zone_id} onChange={e => setForm({...form, zone_id: e.target.value})} required>
                <option value="">Select zone...</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.zone_name} — {z.city}</option>)}
              </select>
            </div>

            {/* Disruption type */}
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label">Disruption Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {DISRUPTION_TYPES.map(d => (
                  <label key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1px solid ${form.disruption_type === d.value ? 'var(--gs-accent)' : 'var(--gs-border)'}`, background: form.disruption_type === d.value ? 'rgba(99,102,241,0.08)' : 'transparent', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" name="disruption_type" value={d.value} checked={form.disruption_type === d.value} onChange={e => setForm({...form, disruption_type: e.target.value})} style={{ display: 'none' }} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Coverage tier */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="gs-label">Coverage Tier</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {COVERAGE_TIERS.map(t => (
                  <label key={t.value} style={{ textAlign: 'center', padding: '1rem', borderRadius: 12, border: `2px solid ${form.coverage_tier === t.value ? t.color : 'var(--gs-border)'}`, background: form.coverage_tier === t.value ? `${t.color}10` : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <input type="radio" name="coverage_tier" value={t.value} checked={form.coverage_tier === t.value} onChange={e => setForm({...form, coverage_tier: e.target.value})} style={{ display: 'none' }} />
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: t.color }}>{t.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gs-text-muted)', margin: '4px 0' }}>Payout: {t.payout}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gs-text-secondary)' }}>Premium: {t.premium}</div>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="gs-btn gs-btn-success" style={{ width: '100%', justifyContent: 'center', padding: 12 }} disabled={loading}>
              {loading ? 'Processing...' : <><FiCheck /> Purchase Policy (1 Week)</>}
            </button>
          </form>
        </div>
      )}

      {/* Policies list */}
      {policies.length > 0 ? (
        <div className="gs-card">
          <table className="gs-table">
            <thead>
              <tr>
                <th>Policy #</th>
                <th>Disruption</th>
                <th>Coverage</th>
                <th>Premium</th>
                <th>Payout</th>
                <th>Valid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.policy_number}</td>
                  <td>{p.disruption_type?.replace('_', ' ')}</td>
                  <td><span className="gs-badge gs-badge-accent">{p.coverage_tier}</span></td>
                  <td>₹{p.premium_amount}</td>
                  <td style={{ fontWeight: 600, color: 'var(--gs-success)' }}>₹{p.payout_amount}</td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(p.week_start).toLocaleDateString()} – {new Date(p.week_end).toLocaleDateString()}</td>
                  <td>{statusBadge(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="gs-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <FiShield size={48} color="var(--gs-text-muted)" />
          <p style={{ color: 'var(--gs-text-muted)', marginTop: '1rem' }}>No policies yet. Buy your first policy to get protected!</p>
        </div>
      )}
    </div>
  );
}
