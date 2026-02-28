import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import RevenueAtRiskWidget from './RevenueAtRiskWidget';
import SignalsWidget from './SignalsWidget';
import { Sparkles, TrendingDown, Package, BarChart3, PanelRightClose, PanelRightOpen, Terminal, Activity } from 'lucide-react';

interface ChatInterfaceProps {
    sessionId?: string;
}

const suggestions = [
    { icon: TrendingDown, text: "Why is revenue dropping for Disney collection?" },
    { icon: Package, text: "Identify stockout risks for the next 7 days" },
    { icon: BarChart3, text: "Show trending products this month" },
    { icon: Sparkles, text: "What actions should I take to boost sales?" },
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ sessionId }) => {
    const { messagesBySession, isTyping, sendMessage, setActiveSession } = useChatStore();
    const { addSession } = useSessionStore();
    const navigate = useNavigate();
    const chatEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [isPanelOpen, setIsPanelOpen] = useState(true);

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
        } else {
            // New Session Setup
            hasCreatedSession.current = false;
            initialQuerySent.current = false;
            setActiveId(null);
            setActiveSession(null);
        }
    }, [sessionId, setActiveSession]);

    // 2. URL ?q= Auto-send Logic
    useEffect(() => {
        const q = searchParams.get('q');

        if (q && !initialQuerySent.current && !sessionId) {
            initialQuerySent.current = true;
            // Clear URL immediately
            setSearchParams({}, { replace: true });

            setTimeout(() => {
                handleFirstMessage(q);
            }, 10);
        }
    }, [searchParams, setSearchParams, sessionId]);

    const messages = activeId ? (messagesBySession[activeId] || []) : [];

    // Scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleFirstMessage = useCallback((text: string) => {
        if (!hasCreatedSession.current) {
            hasCreatedSession.current = true;
            const title = text.length > 60 ? text.substring(0, 57) + '...' : text;

            // Create session in sessionStore
            const newId = addSession(title);

            // Set it as active in local state and chatStore
            setActiveId(newId);
            setActiveSession(newId);

            // Navigate to the new URL without triggering a full remount
            navigate(`/dashboard/intelligence/${newId}`, { replace: true });

            // Send the message using the new ID explicitly
            sendMessage(newId, text);
        } else if (activeId) {
            sendMessage(activeId, text);
        }
    }, [addSession, sendMessage, setActiveSession, navigate, activeId]);

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
        <div className="flex w-full h-full overflow-hidden bg-white/30 backdrop-blur-sm relative">
            {/* Discreet Toggle Button for Intelligence Hub */}
            {!isPanelOpen && (
                <button
                    onClick={() => setIsPanelOpen(true)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-40 bg-white border-y border-l border-gray-200 p-2 text-gray-400 hover:text-black hover:bg-gray-50 transition-all shadow-sm group"
                    title="Open Intelligence Hub"
                >
                    <PanelRightOpen size={16} className="group-hover:scale-110 transition-transform" />
                </button>
            )}

            {/* Main Chat Content */}
            <div className="flex flex-col flex-1 h-full min-w-0 relative">

                <div
                    ref={messagesContainerRef}
                    className="flex-1 px-4 md:px-12 overflow-y-auto scroll-smooth custom-scrollbar"
                >
                    <AnimatePresence mode="wait">
                        {!hasMessages ? (
                            /* Welcome State */
                            <motion.div
                                key="welcome"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="flex flex-col items-center justify-center min-h-[75vh] max-w-5xl mx-auto text-center py-16"
                            >
                                {/* Animated Logo */}
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                    transition={{ duration: 0.8, type: 'spring', damping: 20 }}
                                    className="relative mb-10"
                                >
                                    <div className="w-20 h-20 bg-black flex items-center justify-center shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]">
                                        <span className="font-serif italic text-3xl text-white font-black select-none">N</span>
                                    </div>
                                    <div className="absolute -inset-4 bg-gradient-to-tr from-violet-500/20 via-transparent to-orange-400/20 blur-2xl -z-10 animate-pulse" />
                                </motion.div>

                                <motion.h2
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-4xl font-serif italic text-gray-900 mb-4 font-black"
                                >
                                    Nex Intelligence Engine.
                                </motion.h2>

                                <motion.p
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-[10px] font-mono text-gray-400 mb-12 tracking-[0.2em] font-black uppercase"
                                >
                                    SCANNING REAL-TIME REVENUE AT RISK & ANOMALIES
                                </motion.p>

                                {/* Suggestion Cards */}
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4"
                                >
                                    {suggestions.map((s, i) => (
                                        <motion.button
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 + i * 0.08 }}
                                            onClick={() => handleSuggestionClick(s.text)}
                                            className="group relative flex items-start gap-4 p-5 text-left bg-white border border-gray-100/50 hover:border-violet-500/20 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] transition-all duration-500 cursor-pointer overflow-hidden"
                                        >
                                            <div className="p-2.5 bg-gray-50 group-hover:bg-black group-hover:text-white transition-all duration-300 transform group-hover:rotate-12">
                                                <s.icon size={16} />
                                            </div>
                                            <span className="text-[13px] font-mono font-bold text-gray-500 group-hover:text-black transition-colors leading-relaxed tracking-tight py-1 uppercase">
                                                {s.text}
                                            </span>
                                            {/* Accent line */}
                                            <div className="absolute left-0 top-0 w-0.5 h-full bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </motion.button>
                                    ))}
                                </motion.div>
                            </motion.div>
                        ) : (
                            /* Messages List */
                            <motion.div
                                key="messages"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="max-w-4xl mx-auto py-8 space-y-8"
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
                <div className="sticky bottom-0 px-4 md:px-12 pb-6 pt-6 bg-gradient-to-t from-white via-white/95 to-transparent z-20">
                    <div className="max-w-4xl mx-auto w-full relative">
                        <ChatInput onSubmit={handleSendMessage} disabled={isTyping} />
                        <div className="flex items-center justify-between mt-3 px-1 animate-in fade-in slide-in-from-bottom-2 duration-1000">
                            <div className="flex items-center gap-4 text-[9px] font-mono font-bold text-gray-400 tracking-tighter uppercase select-none">
                                <span className="flex items-center gap-1.5"><Terminal size={10} className="text-violet-500" /> ENGINE: V.1.0.4</span>
                                <div className="w-1 h-1 rounded-full bg-gray-200" />
                                <span className="flex items-center gap-1.5 opacity-70"><Activity size={10} className="text-orange-400" /> LATENCY: 24MS</span>
                            </div>
                            <span className="text-[9px] font-mono text-gray-300 font-bold uppercase tracking-[0.2em] select-none">AUDIT PERSISTENCE ACTIVE</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Intelligence Side Panel */}
            <AnimatePresence>
                {isPanelOpen && (
                    <motion.div
                        initial={{ width: 0, opacity: 0, x: 20 }}
                        animate={{ width: 380, opacity: 1, x: 0 }}
                        exit={{ width: 0, opacity: 0, x: 20 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full border-l border-gray-200/50 bg-white/70 backdrop-blur-2xl flex flex-col flex-shrink-0 relative z-30 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]"
                    >
                        {/* Panel Header */}
                        <div className="p-8 border-b border-gray-100 flex-shrink-0 relative overflow-hidden group/panelheader">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-black font-mono tracking-[0.4em] text-gray-400/80 uppercase">Intelligence Hub</h3>
                                <button
                                    onClick={() => setIsPanelOpen(false)}
                                    className="p-1.5 text-gray-300 hover:text-black hover:bg-gray-100 transition-all rounded-sm z-20"
                                    title="Close Intelligence Hub"
                                >
                                    <PanelRightClose size={16} />
                                </button>
                            </div>
                            <div className="flex items-end justify-between relative z-10">
                                <span className="text-2xl font-serif italic font-black text-gray-900 leading-none tracking-tight">Real-time Pulse.</span>
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-mono font-bold text-emerald-600 uppercase tracking-tighter">Live</span>
                                        <motion.div
                                            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* Decorative background element for header */}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 blur-3xl rounded-full -mr-10 -mt-10 group-hover/panelheader:bg-violet-500/10 transition-colors" />
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-14">
                            <section className="animate-in fade-in slide-in-from-right-4 duration-700 delay-150">
                                <RevenueAtRiskWidget />
                            </section>

                            <section className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-4 duration-700 delay-300">
                                <SignalsWidget />
                            </section>
                        </div>

                        {/* Panel Footer/Status */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50/30">
                            <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 font-bold uppercase tracking-widest">
                                <span>Security Level: Tier A</span>
                                <span>Sync: 0.8s</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChatInterface;
