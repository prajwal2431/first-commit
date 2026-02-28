import React from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useSidebarStore } from '@/stores/sidebarStore';
import SidebarNav from './SidebarNav';
import SessionHistory from './SessionHistory';
import UserProfileCard from './UserProfileCard';
import { useNavigate } from 'react-router-dom';

const Sidebar: React.FC = () => {
    const { isOpen, toggle, width } = useSidebarStore();
    const navigate = useNavigate();

    const handleNewChat = () => {
        navigate('/dashboard/intelligence');
    };

    return (
        <motion.aside
            initial={false}
            animate={{ width }}
            className="fixed left-0 top-0 h-full bg-white/70 backdrop-blur-2xl border-r border-gray-200 z-50 flex flex-col transition-all duration-300 shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]"
        >
            <div className={`flex flex-col h-full min-w-[72px] ${isOpen ? 'w-[280px]' : 'w-[72px]'}`}>

                {/* Top Actions */}
                <div className="p-3 flex items-center justify-between border-b border-gray-200/50">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggle}
                            className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors flex shrink-0 justify-center items-center"
                            title={isOpen ? "Close Sidebar" : "Open Sidebar"}
                        >
                            {isOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                        </button>
                    </div>

                    {isOpen && (
                        <button
                            onClick={handleNewChat}
                            className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors flex shrink-0 justify-center items-center gap-2 font-mono text-xs uppercase"
                            title="New Chat"
                        >
                            <Plus size={18} />
                        </button>
                    )}

                    {!isOpen && (
                        <div className="absolute top-[60px] left-0 w-full flex justify-center">
                            <button
                                onClick={handleNewChat}
                                className="p-2 mt-2 text-gray-500 hover:text-black hover:bg-gray-100 transition-colors"
                                title="New Chat"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation Toggles */}
                <SidebarNav />

                {/* History List */}
                <SessionHistory />

                {/* User Profile Footer */}
                <UserProfileCard />
            </div>
        </motion.aside>
    );
};

export default Sidebar;
