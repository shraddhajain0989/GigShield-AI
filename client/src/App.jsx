// ============================================================================
// GigShield AI — App with Routing
// ============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './ErrorBoundary';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/worker/Dashboard';
import Policies from './pages/worker/Policies';
import Claims from './pages/worker/Claims';
import Earnings from './pages/worker/Earnings';
import Profile from './pages/worker/Profile';
import AdminAnalytics from './pages/admin/Analytics';
import ClaimsMonitor from './pages/admin/ClaimsMonitor';
import FraudAlerts from './pages/admin/FraudAlerts';
import RiskHeatmap from './pages/admin/RiskHeatmap';
import Workers from './pages/admin/Workers';

function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={isAuthenticated ? <Navigate to={isAdmin ? '/admin' : '/dashboard'} /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />} />

      {/* Worker Routes */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/claims" element={<Claims />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Admin Routes */}
      <Route element={<ProtectedRoute adminOnly><Layout /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminAnalytics />} />
        <Route path="/admin/claims" element={<ClaimsMonitor />} />
        <Route path="/admin/fraud" element={<FraudAlerts />} />
        <Route path="/admin/heatmap" element={<RiskHeatmap />} />
        <Route path="/admin/workers" element={<Workers />} />
      </Route>

      {/* Default */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
