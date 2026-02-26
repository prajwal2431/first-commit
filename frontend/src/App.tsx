import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import DiagnosisPage from '@/pages/DiagnosisPage';
import SourcesPage from '@/pages/SourcesPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="diagnosis/:id" element={<DiagnosisPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default App;
