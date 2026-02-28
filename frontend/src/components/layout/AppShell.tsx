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
                id="right-pane"
                initial={false}
                animate={{ marginLeft: width }}
                className="flex-1 relative z-10 w-full h-screen overflow-hidden flex flex-col transition-all duration-300 bg-[#FAFAFA]"
            >
                <PageHeader />
                <div className="w-full flex-1 flex flex-col p-4 md:px-8 pt-6 pb-0 max-w-[1600px] mx-auto overflow-hidden">
                    <div id="main-scroll" className="flex-1 w-full overflow-y-auto min-h-0 relative flex flex-col">
                        <Outlet />
                    </div>
                </div>
            </motion.main>
        </div>
    );
};

export default AppShell;
