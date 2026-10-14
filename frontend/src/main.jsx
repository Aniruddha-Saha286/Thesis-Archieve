import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import SharedCollectionPage from './components/SharedCollectionPage';
import InstallAppPrompt from './components/InstallAppPrompt';
import ErrorBoundary from './components/ErrorBoundary';
import NoticeToast from './components/NoticeToast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { GoogleOAuthProvider } from '@react-oauth/google';

import { ThemeProvider } from './context/ThemeContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1234567890-placeholder.apps.googleusercontent.com';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <AuthProvider>
            <SocketProvider>
              {new URLSearchParams(window.location.search).has("collection") ? <SharedCollectionPage token={new URLSearchParams(window.location.search).get("collection")} /> : <App />}
              <NoticeToast />
              <InstallAppPrompt />
            </SocketProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
