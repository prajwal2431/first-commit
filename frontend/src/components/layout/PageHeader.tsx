import React from 'react';
import { useLocation } from 'react-router-dom';

const PageHeader: React.FC = () => {
    const location = useLocation();

    const getSubTitle = () => {
        if (location.pathname === '/sources') return 'Connect';
        return 'Intelligence';
    };

    return (
        <header className="flex justify-between items-end mb-12 border-b border-gray-200 pb-4">
            <div>
                <div className="flex items-center space-x-3 mb-2">
                    <span className="font-mono text-xs text-gray-400">[ BONKERS_CORNER_HQ ]</span>
                    <span className="w-2 h-2 bg-emerald-500 animate-pulse"></span>
                </div>
                <h1 className="text-4xl md:text-5xl font-serif italic text-black leading-tight">
                    Nexus {getSubTitle()}
                </h1>
            </div>
            <div className="text-right hidden md:block">
                <p className="font-mono text-xs text-gray-400">SESSION: #ADMIN-09</p>
                <p className="font-mono text-xs text-gray-400">LOC: MUMBAI, MH</p>
            </div>
        </header>
    );
};

export default PageHeader;
