import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import RevenueAtRiskWidget from './RevenueAtRiskWidget';
import SignalsWidget from './SignalsWidget';
import { Sparkles, TrendingDown, Package, BarChart3, Terminal, Activity } from 'lucide-react';

interface ChatInterfaceProps {
    sessionId?: string;
}

const suggestions = [
    { icon: TrendingDown, text: "Why is revenue dropping?" },
    { icon: Package, text: "Identify stockout risks" },
    { icon: BarChart3, text: "Trending products this month" },
    { icon: Sparkles, text: "Actions to boost sales" },
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessionId }) => {
    const { messagesBySession, isTyping, sendMessage, setActiveSession, isChatOpen, setChatOpen } = useChatStore();
    const { isOpen: isSidebarOpen } = useSidebarStore();
    const { addSession, replaceSessionId } = useSessionStore();
    const navigate = useNavigate();
    const chatEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const { fetchDashboard } = useDashboardStore();

    // Fetch dashboard data on mount and poll every 30 seconds
    useEffect(() => {
        fetchDashboard();
        const interval = setInterval(() => {
            fetchDashboard();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchDashboard]);

    // Auto-collapse sidebar when chat opens
    useEffect(() => {
        if (isChatOpen) {
            useSidebarStore.getState().close();
        }
    }, [isChatOpen]);

    // Local state to track the *actual* active session ID for this component instance
    const [activeId, setActiveId] = useState<string | null>(sessionId || null);

    // Refs to protect against React StrictMode double-execution
    const hasCreatedSession = useRef(false);
    const initialQuerySent = useRef(false);

    // 1. Session Loading / Reset Logic
    useEffect(() => {
        if (sessionId) {
            hasCreatedSession.current = true;
            initialQuerySent.current = true; // Prevent ?q= logic when viewing history
            setActiveId(sessionId);
            setActiveSession(sessionId);
            useChatStore.getState().loadMessages(sessionId);
        } else {
            // New Session Setup
            hasCreatedSession.current = false;
            initialQuerySent.current = false;
            setActiveId(null);
            setActiveSession(null);
        }
    }, [sessionId, setActiveSession]);

    const messages = activeId ? (messagesBySession[activeId] || []) : [];

    // Scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleFirstMessage = useCallback(async (text: string) => {
        if (!hasCreatedSession.current) {
            hasCreatedSession.current = true;
            const title = text.length > 60 ? text.substring(0, 57) + '...' : text;

            // Create session in sessionStore (client temp id, e.g. Date.now())
            const newId = addSession(title);

            // Set it as active in local state and chatStore
            setActiveId(newId);
            setActiveSession(newId);

            // Navigate to the new URL without triggering a full remount
            navigate(`/dashboard/intelligence/${newId}`, { replace: true });

            // Send the message; backend creates AnalysisSession and returns real MongoDB sessionId
            const result = await sendMessage(newId, text);
            setChatOpen(true);

            // If backend returned a different session id (real ObjectId), switch to it so /analysis/result/:id works
            const realSessionId = result?.sessionId;
            if (realSessionId && realSessionId !== newId) {
                const latestSessions = useSessionStore.getState().sessions;
                const stillExists = latestSessions.some((s) => s.id === newId);

                // User may delete the optimistic local session before backend responds.
                // In that case, do not resurrect it; delete the backend session as well.
                if (!stillExists) {
                    await useSessionStore.getState().deleteSession(realSessionId);
                    return;
                }

                replaceSessionId(newId, realSessionId);
                setActiveId(realSessionId);
                setActiveSession(realSessionId);
                navigate(`/dashboard/intelligence/${realSessionId}`, { replace: true });
            }
        } else if (activeId) {
            sendMessage(activeId, text);
            setChatOpen(true);
        }
    }, [addSession, sendMessage, setActiveSession, navigate, activeId, replaceSessionId, setChatOpen]);

    // 2. URL ?q= Auto-send Logic
    useEffect(() => {
        const q = searchParams.get('q');

        if (q && !initialQuerySent.current && !sessionId) {
            initialQuerySent.current = true;
            setSearchParams({}, { replace: true });

            setTimeout(() => {
                handleFirstMessage(q);
            }, 10);
        }
    }, [searchParams, setSearchParams, sessionId, handleFirstMessage]);

    const handleSendMessage = (text: string) => {
        if (!hasCreatedSession.current || !activeId) {
            handleFirstMessage(text);
        } else {
            sendMessage(activeId, text);
        }
    };

    const handleSuggestionClick = (text: string) => {
        handleFirstMessage(text);
    };

    const hasMessages = messages.length > 0;

    return (
        <div className="flex w-full h-full overflow-hidden bg-gray-50/50 relative">

            {/* Main Center Pane: Dashboard */}
            <div className="flex-1 flex flex-col h-full min-w-0">

                {/* Dashboard Content */}
                <div className="flex-1 overflow-hidden w-full custom-scrollbar flex flex-col p-0">
                    <div className="flex-1 min-w-0 flex flex-col lg:flex-row bg-transparent rounded-none overflow-hidden">
                        {/* Left Part: Revenue */}
                        <div className="flex-[6] min-w-0 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out bg-transparent overflow-hidden">
                            <RevenueAtRiskWidget />
                        </div>

                        {/* Right Part: Signals */}
                        <div className="flex-[4] min-w-0 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out delay-150 bg-[#FAFAFA] overflow-hidden">
                            <SignalsWidget />
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Pane: Chatbot (Collapsible) */}
            <AnimatePresence>
                {isChatOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0, x: 50 }}
                        animate={{
                            width: !isSidebarOpen ? '33.33%' : 380,
                            opacity: 1,
                            x: 0
                        }}
                        exit={{ width: 0, opacity: 0, x: 50 }}
                        transition={{ duration: 0.5, type: 'spring', damping: 25, stiffness: 200 }}
                        className="h-full border-l border-gray-200 bg-white/95 backdrop-blur-xl flex flex-col flex-shrink-0 relative z-30 shadow-[-20px_0_40px_rgba(0,0,0,0.05)]"
                    >


                        {/* Chat Messages */}
                        <div
                            ref={messagesContainerRef}
                            className="flex-1 px-5 pb-6 pt-8 overflow-y-auto scroll-smooth custom-scrollbar relative"
                        >
                            <AnimatePresence mode="wait">
                                {!hasMessages ? (
                                    /* Welcome State Compressed */
                                    <motion.div
                                        key="welcome"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        transition={{ duration: 0.5 }}
                                        className="flex flex-col items-center justify-center min-h-[60vh] text-center"
                                    >
                                        <div className="relative mb-6">
                                            <div className="w-14 h-14 bg-black flex items-center justify-center shadow-2xl skew-x-[-5deg]">
                                                <span className="font-serif italic text-2xl text-white font-black">N</span>
                                            </div>
                                            <div className="absolute -inset-4 bg-gradient-to-tr from-violet-500/20 via-transparent to-orange-400/20 blur-xl -z-10 animate-pulse" />
                                        </div>

                                        <h2 className="text-2xl font-serif italic text-gray-900 mb-2 font-black">Ask Nex.</h2>
                                        <p className="text-[10px] font-mono text-gray-500 mb-8 tracking-[0.1em] font-bold uppercase max-w-[260px] leading-relaxed">
                                            Run deep analysis, diagnose anomalies, or configure your thresholds.
                                        </p>

                                        {/* Suggestion Cards */}
                                        <div className="flex flex-col gap-2.5 w-full">
                                            {suggestions.map((s, i) => (
                                                <motion.button
                                                    key={i}
                                                    initial={{ opacity: 0, x: 20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: 0.2 + i * 0.1 }}
                                                    onClick={() => handleSuggestionClick(s.text)}
                                                    className="group relative flex items-center gap-3 p-3.5 text-left bg-gray-50 border border-gray-100 hover:border-violet-300 hover:bg-white transition-all cursor-pointer overflow-hidden shadow-sm hover:shadow"
                                                >
                                                    <div className="p-1.5 bg-white shadow-sm border border-gray-100 group-hover:bg-black group-hover:text-white transition-colors">
                                                        <s.icon size={14} />
                                                    </div>
                                                    <span className="text-[11px] font-mono font-bold text-gray-600 group-hover:text-black transition-colors leading-relaxed tracking-tight uppercase truncate">
                                                        {s.text}
                                                    </span>
                                                    <div className="absolute left-0 top-0 w-0.5 h-full bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </motion.button>
                                            ))}
                                        </div>
                                    </motion.div>
                                ) : (
                                    /* Messages List */
                                    <motion.div
                                        key="messages"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="space-y-8 px-0"
                                    >
                                        {messages.map((msg) => (
                                            <ChatMessage key={msg.id} message={msg} />
                                        ))}

                                        {isTyping && <TypingIndicator />}

                                        <div ref={chatEndRef} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Sticky Input Bar */}
                        <div className="p-5 pt-2 bg-gradient-to-t from-white via-white to-white/90 z-20">
                            <ChatInput onSubmit={handleSendMessage} disabled={isTyping} />
                            <div className="flex items-center justify-between mt-3 px-1">
                                <div className="flex items-center gap-3 text-[9px] font-mono font-bold text-gray-400 tracking-tighter uppercase select-none">
                                    <span className="flex items-center gap-1.5"><Terminal size={10} className="text-violet-500" /> V.1.0.4</span>
                                    <div className="w-1 h-1 rounded-full bg-gray-200" />
                                    <span className="flex items-center gap-1.5 opacity-70"><Activity size={10} className="text-orange-400" /> 24MS</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChatInterface;
