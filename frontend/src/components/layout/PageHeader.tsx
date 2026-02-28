import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

const PageHeader: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();

  const getSubTitle = () => {
    if (location.pathname.startsWith('/dashboard/sources')) return 'Connect';
    if (location.pathname.startsWith('/dashboard/signals')) return 'Signal Insight';
    if (location.pathname.startsWith('/dashboard/settings')) return 'Settings';
    if (location.pathname.startsWith('/dashboard/diagnosis')) return 'Diagnosis';
    return 'Intelligence';
  };

  const tenantLabel = user?.tenant?.id?.toUpperCase().replace(/-/g, '_') ?? 'WORKSPACE';

  return (
    <header className="flex justify-center w-full h-[60px] border-b border-gray-200/50 shrink-0 bg-[#FAFAFA]/80 backdrop-blur-md z-20 sticky top-0">
      <div className="w-full max-w-[1600px] px-4 md:px-8 flex items-center justify-between h-full">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-none bg-emerald-500 animate-pulse"></span>
            <span className="font-mono text-[10px] text-gray-500 tracking-widest uppercase">
              [ {tenantLabel} ]
            </span>
          </div>
          <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
          <h1 className="text-base md:text-lg font-serif italic text-black m-0 leading-none">
            Nexus {getSubTitle()}
          </h1>
        </div>

        <div className="hidden md:flex items-center gap-4 text-gray-400">
          <p className="font-mono text-[10px] uppercase tracking-widest">
            ROLE: {user?.role?.toUpperCase() ?? 'N/A'}
          </p>
          <div className="h-3 w-px bg-gray-200"></div>
          <p className="font-mono text-[10px] tracking-wide text-gray-500 hover:text-black transition-colors cursor-pointer">
            {user?.email ?? ''}
          </p>
        </div>
      </div>
    </header>
  );
};

export default PageHeader;
