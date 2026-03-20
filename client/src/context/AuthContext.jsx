// ============================================================================
// GigShield AI — Auth Context
// ============================================================================

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('gs_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);

  const login = async (phone, password) => {
    const { data } = await authAPI.login({ phone, password });
    const { user: u, tokens } = data.data;
    localStorage.setItem('gs_token', tokens.accessToken);
    localStorage.setItem('gs_refresh', tokens.refreshToken);
    localStorage.setItem('gs_user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const register = async (formData) => {
    const { data } = await authAPI.register(formData);
    const { user: u, tokens } = data.data;
    localStorage.setItem('gs_token', tokens.accessToken);
    localStorage.setItem('gs_refresh', tokens.refreshToken);
    localStorage.setItem('gs_user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('gs_token');
    localStorage.removeItem('gs_refresh');
    localStorage.removeItem('gs_user');
    setUser(null);
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, isAdmin, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
