import { useState, useEffect } from 'react';
import { userAPI } from '../../api';
import { FiUser, FiCheck, FiShield, FiCreditCard } from 'react-icons/fi';

export default function Profile() {
  const [profile, setProfile] = useState({
    name: '',
    phone: '',
    language: 'en',
    platform: 'swiggy',
    upi_id: '',
    kyc_status: 'pending'
  });
  
  const [kycForm, setKycForm] = useState({ aadhaar_number: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data } = await userAPI.getProfile();
      if (data?.data?.user) {
        setProfile({
          name: data.data.user.name || '',
          phone: data.data.user.phone || '',
          language: data.data.user.language || 'en',
          platform: data.data.user.platform || 'swiggy',
          upi_id: data.data.user.upi_id || '',
          kyc_status: data.data.user.kyc_status || 'pending'
        });
      }
    } catch (err) {
      console.error('Failed to load profile', err);
    }
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await userAPI.updateProfile({
        name: profile.name,
        language: profile.language,
        platform: profile.platform,
        upi_id: profile.upi_id
      });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await userAPI.submitKyc({ aadhaar_number: kycForm.aadhaar_number, documents: [{ type: 'aadhaar' }] });
      setMessage({ type: 'success', text: 'KYC submitted successfully!' });
      loadProfile(); // Refresh to update kyc_status
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to submit KYC' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gs-page gs-fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="gs-page-title">My Profile</h1>
        <p className="gs-page-subtitle">Manage your personal details and KYC validation</p>
      </div>

      {message.text && (
        <div style={{ 
          padding: '12px 16px', 
          marginBottom: '1.5rem', 
          borderRadius: 8, 
          background: message.type === 'success' ? 'var(--gs-success-bg)' : 'var(--gs-danger-bg)',
          color: message.type === 'success' ? 'var(--gs-success)' : 'var(--gs-danger)',
          fontWeight: 500
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        {/* Profile Settings Card */}
        <div className="gs-card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiUser /> Personal Details
          </h3>
          <form onSubmit={handleUpdateProfile}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label">Full Name</label>
              <input type="text" className="gs-input" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label">Phone Number (Read Only)</label>
              <input type="text" className="gs-input" value={profile.phone} disabled style={{ opacity: 0.7 }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label">Primary Platform</label>
              <select className="gs-input" value={profile.platform} onChange={e => setProfile({...profile, platform: e.target.value})}>
                <option value="swiggy">Swiggy</option>
                <option value="zomato">Zomato</option>
                <option value="blinkit">Blinkit</option>
                <option value="zepto">Zepto</option>
                <option value="uber">Uber</option>
                <option value="ola">Ola</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="gs-label"><FiCreditCard size={12}/> UPI ID (For Payouts)</label>
              <input type="text" className="gs-input" value={profile.upi_id} onChange={e => setProfile({...profile, upi_id: e.target.value})} placeholder="example@upi" />
            </div>
            <button type="submit" className="gs-btn gs-btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              <FiCheck /> Save Changes
            </button>
          </form>
        </div>

        {/* KYC Verification Card */}
        <div className="gs-card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiShield /> Identity Verification (KYC)
          </h3>
          
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(99,102,241,0.05)', borderRadius: 8, border: '1px solid var(--gs-border)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--gs-text-secondary)' }}>Current Status: </span>
            <span className={`gs-badge gs-badge-${profile.kyc_status === 'verified' ? 'success' : (profile.kyc_status === 'submitted' ? 'warning' : 'danger')}`} style={{ textTransform: 'uppercase', marginLeft: '0.5rem' }}>
              {profile.kyc_status}
            </span>
          </div>

          {(profile.kyc_status === 'pending' || profile.kyc_status === 'rejected') && (
            <form onSubmit={handleKycSubmit}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gs-text-muted)', marginBottom: '1rem' }}>
                Please provide your Aadhaar details to verify your identity and enable automated claims payouts.
              </p>
              <div style={{ marginBottom: '1.5rem' }}>
                <label className="gs-label">Aadhaar Number</label>
                <input 
                  type="text" 
                  className="gs-input" 
                  value={kycForm.aadhaar_number} 
                  onChange={e => setKycForm({...kycForm, aadhaar_number: e.target.value})} 
                  placeholder="1234 5678 9012"
                  pattern="\d{12}"
                  title="12 digit Aadhaar number"
                  required 
                />
              </div>
              <button type="submit" className="gs-btn gs-btn-success" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                <FiCheck /> Submit KYC
              </button>
            </form>
          )}

          {profile.kyc_status === 'submitted' && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gs-text-muted)', fontSize: '0.9rem' }}>
              Your KYC documents are currently under review. This usually takes 1-2 business days.
            </div>
          )}

          {profile.kyc_status === 'verified' && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gs-success)', fontSize: '0.9rem', fontWeight: 500 }}>
              <FiCheck size={24} style={{ display: 'block', margin: '0 auto 0.5rem' }} />
              Your identity is fully verified!
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
