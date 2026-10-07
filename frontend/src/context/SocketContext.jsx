import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { token, user, updateUserStatus, logout, refreshUser } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState(null);
  const [notificationTick, setNotificationTick] = useState(0);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const s = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);
      if (token) {
        s.emit('auth:authenticate', token);
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    s.on('user:status_changed', (payload) => {
      if (!user) return;
      const currentUserId = String(user.id || user._id);
      const targetStudentId = String(payload.studentId || payload.student?._id || payload.student?.id);

      if (currentUserId === targetStudentId) {
        if (payload.status === 'deleted') {
          setRealtimeNotice({
            type: 'error',
            message: 'Your academic account has been removed by an administrator.',
          });
          logout();
          return;
        }

        updateUserStatus(payload.status, {
          banReason: payload.reason || '',
          verifiedAt: payload.verifiedAt,
        });

        if (payload.status === 'approved') {
          setRealtimeNotice({
            type: 'success',
            message: 'Academic Application Approved: Full access to peer-reviewed repositories, raw datasets, and citation generators is now active!',
          });
        } else if (payload.status === 'banned') {
          setRealtimeNotice({
            type: 'error',
            message: `Disciplinary Action: Your account has been suspended by the Editorial Board. Reason: ${payload.reason || 'Honor code violation'}`,
          });
        }
      }
    });

    s.on('membership:updated', (payload) => {
      if (refreshUser) refreshUser();
      setRealtimeNotice({
        type: 'info',
        message: payload.plan === 'free'
          ? 'Membership access updated: Your account is now on the Standard Free tier.'
          : `Membership updated: ${payload.label || 'Active Access'} is now active!`,
      });
    });

    s.on('auth:permissions_updated', (payload) => {
      if (refreshUser) refreshUser();
      if (payload.role === 'editor') {
        setRealtimeNotice({
          type: 'success',
          message: 'Staff Privileges Granted: You have been appointed as a Depository Editor with assigned permissions.',
        });
      } else {
        setRealtimeNotice({
          type: 'info',
          message: 'Role Updated: Your account has been returned to standard scholar status.',
        });
      }
    });

    s.on('notification:new', (notif) => {
      setNotificationTick((n) => n + 1);
      if (notif?.message) {
        setRealtimeNotice({
          type: notif.type === 'membership_cancelled' ? 'error' : 'info',
          message: `${notif.title ? notif.title + ' — ' : ''}${notif.message}`,
        });
      }
    });

    s.on('auth:revoked', () => {
      if (refreshUser) refreshUser();
    });

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token, user?._id, user?.id]);

  const value = {
    socket,
    isConnected,
    realtimeNotice,
    notificationTick,
    clearRealtimeNotice: () => setRealtimeNotice(null),
    setRealtimeNotice,
    showNotice: (msg, type = 'info') =>
      setRealtimeNotice(typeof msg === 'string' ? { type, message: msg } : msg),
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    return {
      socket: null,
      isConnected: false,
      realtimeNotice: null,
      notificationTick: 0,
      clearRealtimeNotice: () => {},
      setRealtimeNotice: () => {},
      showNotice: () => {},
    };
  }
  return context;
};
