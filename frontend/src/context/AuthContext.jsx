import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

// Global Axios request interceptor: guarantees Bearer token is attached to every single request
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

  // Set default axios authorization header whenever token changes
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

  const fetchCurrentUser = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/auth/me');
      setUser(res.data.user);
    } catch (err) {
      console.warn('Session expired or invalid token:', err.message);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

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
    setUser((prev) => (prev ? { ...prev, status: newStatus, ...extraFields } : prev));
  };

  const logout = () => {
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
