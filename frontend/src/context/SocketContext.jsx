import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { token, user, updateUserStatus, logout } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      if (token) {
        socket.emit('auth:authenticate', token);
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle personal real-time status update from the Editorial Board
    socket.on('user:status_changed', (payload) => {
      if (!user) return;
      const currentUserId = String(user.id || user._id);
      const targetStudentId = String(payload.studentId || payload.student?._id || payload.student?.id);

      if (currentUserId === targetStudentId) {
        if (payload.status === 'deleted') {
          alert('Your academic account has been removed by an administrator.');
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

    return () => {
      socket.disconnect();
    };
  }, [token, user?._id, user?.id]);

  const value = {
    socket: socketRef.current,
    isConnected,
    realtimeNotice,
    clearRealtimeNotice: () => setRealtimeNotice(null),
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    return { socket: null, isConnected: false, realtimeNotice: null, clearRealtimeNotice: () => {} };
  }
  return context;
};
