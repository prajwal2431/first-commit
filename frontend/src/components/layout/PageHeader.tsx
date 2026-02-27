import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

const PageHeader: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();

  const getSubTitle = () => {
    if (location.pathname.startsWith('/dashboard/sources')) return 'Connect';
    if (location.pathname.startsWith('/dashboard/diagnosis')) return 'Diagnosis';
    return 'Intelligence';
  };

  const tenantLabel = user?.tenant?.id?.toUpperCase().replace(/-/g, '_') ?? 'WORKSPACE';

  return (
    <header className="flex justify-between items-end mb-12 border-b border-gray-200 pb-4">
      <div>
        <div className="flex items-center space-x-3 mb-2">
          <span className="font-mono text-xs text-gray-400">[ {tenantLabel} ]</span>
          <span className="w-2 h-2 bg-emerald-500 animate-pulse"></span>
        </div>
        <h1 className="text-4xl md:text-5xl font-serif italic text-black leading-tight">
          Nexus {getSubTitle()}
        </h1>
      </div>
      <div className="text-right hidden md:block">
        <p className="font-mono text-xs text-gray-400">ROLE: {user?.role?.toUpperCase() ?? 'N/A'}</p>
        <p className="font-mono text-xs text-gray-400">{user?.email ?? ''}</p>
      </div>
    </header>
  );
};

export default PageHeader;
