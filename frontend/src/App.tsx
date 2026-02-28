import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AppShell from '@/components/layout/AppShell';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import DiagnosisPage from '@/pages/DiagnosisPage';
import SourcesPage from '@/pages/SourcesPage';
import ChatPage from '@/pages/ChatPage';
import SignalInsightPage from '@/pages/SignalInsightPage';
import SettingsPage from '@/pages/SettingsPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuthStore();

  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuthStore();

  if (loading) return null;
  if (token) return <Navigate to="/dashboard/intelligence" replace />;

  return <>{children}</>;
};

const App: React.FC = () => {
  const { loadSession, token } = useAuthStore();

  useEffect(() => {
    if (token) loadSession();
  }, []);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<GuestRoute><LandingPage /></GuestRoute>} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

      {/* Protected dashboard routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Navigate to="/dashboard/intelligence" replace />} />
        <Route path="/dashboard/sources" element={<SourcesPage />} />
        <Route path="/dashboard/intelligence" element={<ChatPage />} />
        <Route path="/dashboard/intelligence/:sessionId" element={<ChatPage />} />
        <Route path="/dashboard/signals/:signalId" element={<SignalInsightPage />} />
        <Route path="/dashboard/settings" element={<SettingsPage />} />
        <Route path="/dashboard/diagnosis/:id" element={<DiagnosisPage />} />

        {/* Legacy routes → redirect to unified intelligence */}
        <Route path="/dashboard/chat" element={<Navigate to="/dashboard/intelligence" replace />} />
        <Route path="/dashboard/chat/:sessionId" element={<Navigate to="/dashboard/intelligence" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
