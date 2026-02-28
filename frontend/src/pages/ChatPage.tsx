import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Network, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GridCard from '@/components/ui/GridCard';
import { request } from '@/services/api/client';
import { useSidebarStore } from '@/stores/sidebarStore';

const ChatPage: React.FC = () => {
    const navigate = useNavigate();
    const [chatInput, setChatInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { isOpen: isSidebarOpen } = useSidebarStore();

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || isSubmitting) return;

        const query = chatInput.trim();
        setIsSubmitting(true);
        try {
            const data = await request<{ analysisId: string }>('/analysis/start', {
                method: 'POST',
                body: JSON.stringify({ query }),
            });
            navigate(`/dashboard/diagnosis/${data.analysisId}?q=${encodeURIComponent(query)}`);
        } catch {
            const fallbackId = Date.now().toString();
            navigate(`/dashboard/diagnosis/${fallbackId}?q=${encodeURIComponent(query)}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const navigateToDashboard = () => navigate('/dashboard/intelligence');
    const navigateToSources = () => navigate('/dashboard/sources');

    const sidebarWidth = isSidebarOpen ? 280 : 72;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full relative"
        >
            <div className="flex-1 pb-32">
                <div className="max-w-4xl mx-auto mt-8 md:mt-16 space-y-12">
                    <h2 className="text-3xl md:text-4xl font-serif italic text-center text-gray-800">
                        How can Nexus assist you today?
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div onClick={navigateToDashboard}>
                            <GridCard className="hover:border-black cursor-pointer bg-white/60">
                                <div className="p-3 bg-white border border-gray-200 inline-block mb-4 shadow-sm">
                                    <Activity size={20} className="text-black" />
                                </div>
                                <h3 className="font-bold text-lg">Intelligence & Diagnosis</h3>
                                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                                    Run automatic root cause analysis on sales anomalies, traffic drops, and generate actionable operational playbooks.
                                </p>
                            </GridCard>
                        </div>

                        <div onClick={navigateToSources}>
                            <GridCard className="hover:border-black cursor-pointer bg-white/60">
                                <div className="p-3 bg-white border border-gray-200 inline-block mb-4 shadow-sm">
                                    <Network size={20} className="text-black" />
                                </div>
                                <h3 className="font-bold text-lg">Data Integration Ecosystem</h3>
                                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                                    Manage connections across 40+ platforms. Map your D2C, ERP, and Logistics providers into a unified canonical schema.
                                </p>
                            </GridCard>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fixed Input Form at bottom */}
            <div className="fixed bottom-0 left-0 w-full pt-8 pb-6 px-4 pointer-events-none" style={{ marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA] to-transparent z-0 pointer-events-auto" />

                <div className="max-w-4xl mx-auto relative z-10 pointer-events-auto">
                    <div className="relative group shadow-xl rounded-xl">
                        <div className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-orange-300 opacity-15 blur-lg transition duration-500 group-hover:opacity-30 rounded-xl"></div>
                        <form onSubmit={handleChatSubmit} className="relative bg-white border border-gray-200 p-2 flex items-center rounded-xl shadow-sm">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                disabled={isSubmitting}
                                className="w-full bg-transparent border-none outline-none text-base md:text-lg font-sans text-gray-800 placeholder-gray-400 px-4 disabled:opacity-50"
                                placeholder="Message Nexus..."
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isSubmitting}
                                className="bg-black text-white p-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                                <Send size={18} />
                            </button>
                        </form>
                    </div>
                    <div className="text-center mt-3">
                        <span className="text-[10px] font-mono text-gray-400 tracking-wide uppercase">Nexus AI can make mistakes. Verify important operational data.</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default ChatPage;
