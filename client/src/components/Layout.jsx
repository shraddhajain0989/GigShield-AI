// ============================================================================
// GigShield AI — Sidebar Layout Component
// ============================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiShield, FiHome, FiFileText, FiClock, FiDollarSign, FiSettings, FiLogOut,
         FiAlertTriangle, FiMapPin, FiBarChart2, FiUsers } from 'react-icons/fi';

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const workerNav = [
    { to: '/dashboard',      icon: <FiHome />,      label: 'Dashboard' },
    { to: '/policies',       icon: <FiFileText />,   label: 'My Policies' },
    { to: '/claims',         icon: <FiClock />,      label: 'Claim History' },
    { to: '/earnings',       icon: <FiDollarSign />, label: 'Earnings Protected' },
    { to: '/profile',        icon: <FiSettings />,   label: 'Profile' }
  ];

  const adminNav = [
    { to: '/admin',          icon: <FiBarChart2 />,      label: 'Analytics' },
    { to: '/admin/claims',   icon: <FiAlertTriangle />,  label: 'Claims Monitor' },
    { to: '/admin/fraud',    icon: <FiShield />,         label: 'Fraud Alerts' },
    { to: '/admin/heatmap',  icon: <FiMapPin />,         label: 'Risk Heatmap' },
    { to: '/admin/workers',  icon: <FiUsers />,          label: 'Workers' },
  ];

  const navItems = isAdmin ? adminNav : workerNav;

  return (
    <div style={{ display: 'flex' }}>
      {/* Sidebar */}
      <aside className="gs-sidebar">
        <div className="gs-sidebar-brand">
          <FiShield size={28} color="#6366f1" />
          <h2>GigShield AI</h2>
        </div>

        <ul className="gs-sidebar-nav">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `gs-sidebar-link ${isActive ? 'active' : ''}`
                }
                end={item.to === '/dashboard' || item.to === '/admin'}
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* User info + logout */}
        <div style={{ borderTop: '1px solid var(--gs-border)', paddingTop: '1rem' }}>
          <div style={{ padding: '0 14px', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gs-text-muted)' }}>
              {user?.phone} · <span className="gs-badge-accent gs-badge">{user?.role}</span>
            </div>
          </div>
          <button className="gs-sidebar-link" onClick={handleLogout} style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <FiLogOut /> Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="gs-main-content">
        <Outlet />
      </main>
    </div>
  );
}
