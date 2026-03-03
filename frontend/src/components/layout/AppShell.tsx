import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import BackgroundAurora from '../ui/BackgroundAurora';
import { useSidebarStore } from '@/stores/sidebarStore';
import { motion } from 'framer-motion';

const AppShell: React.FC = () => {
    const { width } = useSidebarStore();
    const location = useLocation();
    const isIntelligencePage = location.pathname.includes('/dashboard/intelligence');

    return (
        <div className="min-h-screen min-h-[100vh] relative flex overflow-hidden bg-[#FAFAFA]">
            <BackgroundAurora />

            <Sidebar />

            {/* Main Content Area */}
            <motion.main
                id="right-pane"
                initial={false}
                animate={{ marginLeft: width }}
                className="flex-1 relative z-10 w-full h-screen overflow-hidden flex flex-col transition-all duration-300 bg-[#FAFAFA]"
            >
                <PageHeader />
                <div className="w-full flex-1 flex flex-col pt-0 pb-0 overflow-hidden">
                    <div id="main-scroll" className={`flex-1 w-full overflow-y-auto min-h-0 relative flex flex-col ${isIntelligencePage ? '' : 'p-6 lg:p-8'}`}>
                        <Outlet />
                    </div>
                </div>
            </motion.main>
        </div>
    );
};

export default AppShell;
