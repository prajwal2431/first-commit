import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import BackgroundAurora from '../ui/BackgroundAurora';
import { useSidebarStore } from '@/stores/sidebarStore';
import { motion } from 'framer-motion';

const AppShell: React.FC = () => {
    const { width } = useSidebarStore();

    return (
        <div className="min-h-screen min-h-[100vh] relative flex overflow-hidden bg-[#FAFAFA]">
            <BackgroundAurora />

            <Sidebar />

            {/* Main Content Area */}
            <motion.main
                initial={false}
                animate={{ marginLeft: width }}
                className="flex-1 relative z-10 w-full min-h-screen overflow-y-auto transition-all duration-300 bg-[#FAFAFA]"
            >
                <div className="max-w-[1440px] mx-auto p-4 md:p-8 lg:p-12 pt-8">
                    <PageHeader />
                    <Outlet />
                </div>
            </motion.main>
        </div>
    );
};

export default AppShell;
