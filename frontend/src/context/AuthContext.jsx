import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { cacheOfflineSession, offlineSession, clearOfflineData } from '../utils/offlineLibrary';

const AuthContext = createContext();

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL.replace(/\/+$/, '');
}

axios.interceptors.request.use((config) => {
  const savedToken = localStorage.getItem('thesis_vault_token');
  if (savedToken) {
    config.headers['Authorization'] = `Bearer ${savedToken}`;
  }
  return config;
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('thesis_vault_token') || null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    const requestToken = localStorage.getItem('thesis_vault_token');
    if (!requestToken) return;
    try {
      const res = await axios.get('/api/auth/me');
      if (requestToken !== localStorage.getItem('thesis_vault_token')) return;
      setUser(res.data.user);
      if (res.data.user?.status !== 'approved') clearOfflineData(localStorage);
      cacheOfflineSession(localStorage, res.data.user);
    } catch (err) {
      if (requestToken !== localStorage.getItem('thesis_vault_token')) return;
      if (err.response?.data?.status === 'banned') {
        clearOfflineData(localStorage);
        setUser(prev => prev ? { ...prev, status: 'banned', banReason: err.response.data.banReason } : null);
        return;
      }
      if (!navigator.onLine || !err.response || err.response.status >= 500) {
        const cached = await offlineSession(localStorage);
        if (requestToken !== localStorage.getItem('thesis_vault_token')) return;
        if (cached) { setUser(cached); return; }
        return;
      }
      clearOfflineData(localStorage);
      console.warn('Session expired or invalid token:', err.message);
      setToken(null);
      setUser(null);
    } finally {
      if (requestToken === localStorage.getItem('thesis_vault_token')) setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('thesis_vault_token', token);
      fetchCurrentUser();
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('thesis_vault_token');
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const reconnect = () => { if (token && document.visibilityState !== 'hidden') fetchCurrentUser(); };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    const timer = token ? setInterval(reconnect, 60000) : null;
    return () => {
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
      clearInterval(timer);
    };
  }, [token]);

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password });
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    localStorage.setItem('thesis_vault_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const loginWithGoogle = async (googlePayload) => {
    const res = await axios.post('/api/auth/google', googlePayload);
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    localStorage.setItem('thesis_vault_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const updateUserStatus = (newStatus, extraFields = {}) => {
    if (newStatus !== 'approved') clearOfflineData(localStorage);
    setUser((prev) => (prev ? { ...prev, status: newStatus, ...extraFields } : prev));
  };

  const logout = () => {
    localStorage.removeItem('thesis_vault_token');
    clearOfflineData(localStorage);
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    needsRegistration: !!user && !user.isProfileComplete && user.role === 'student',
    isApproved: user?.role === 'admin' || user?.role === 'editor' || (user?.role === 'student' && user?.status === 'approved'),
    isAdmin: user?.role === 'admin',
    isEditor: user?.role === 'editor',
    isStaff: user?.role === 'admin' || user?.role === 'editor',
    isPending: user?.role === 'student' && ['pending', 'banned', 'rejected'].includes(user?.status),
    hasPermission: (perm) => user?.role === 'admin' || (user?.role === 'editor' && Array.isArray(user?.permissions) && user.permissions.includes(perm)),
    login,
    loginWithGoogle,
    logout,
    refreshUser: fetchCurrentUser,
    updateUserStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
