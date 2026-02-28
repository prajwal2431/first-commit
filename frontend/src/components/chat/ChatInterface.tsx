import React, { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';
import { useSessionStore } from '@/stores/sessionStore';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';
import SignalsBanner from './SignalsBanner';
import { Sparkles, TrendingDown, Package, BarChart3 } from 'lucide-react';

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
        <div className="flex flex-col h-full">
            {/* Messages Area */}
            <div
                ref={messagesContainerRef}
                className="flex-1 px-4 md:px-8"
            >
                <AnimatePresence mode="wait">
                    {!hasMessages ? (
                        /* Welcome State */
                        <motion.div
                            key="welcome"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.5 }}
                            className="flex flex-col items-center justify-center min-h-[60vh] max-w-4xl mx-auto text-center"
                        >
                            {/* Signals Banner */}
                            <div className="w-full mb-8">
                                <SignalsBanner />
                            </div>

                            {/* Animated Logo */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                                className="relative mb-8"
                            >
                                <div className="w-20 h-20 bg-black flex items-center justify-center shadow-2xl">
                                    <span className="font-serif italic text-3xl text-white">N</span>
                                </div>
                                <div className="absolute -inset-3 bg-gradient-to-r from-violet-400/20 to-orange-300/20 blur-xl -z-10" />
                            </motion.div>

                            <motion.h2
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-3xl font-serif italic text-gray-900 mb-3"
                            >
                                How can I help you today?
                            </motion.h2>

                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-sm font-mono text-gray-400 mb-12 tracking-wide"
                            >
                                ASK ABOUT REVENUE, STOCKOUTS, OR BUSINESS INSIGHTS
                            </motion.p>

                            {/* Suggestion Cards */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl"
                            >
                                {suggestions.map((s, i) => (
                                    <motion.button
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 + i * 0.08 }}
                                        onClick={() => handleSuggestionClick(s.text)}
                                        className="group relative flex items-start gap-3 p-4 text-left bg-white/80 backdrop-blur border border-gray-200/80 hover:border-gray-300 hover:shadow-lg transition-all duration-300 cursor-pointer"
                                    >
                                        <div className="p-2 bg-gray-50 group-hover:bg-black group-hover:text-white transition-colors duration-300 shrink-0">
                                            <s.icon size={16} />
                                        </div>
                                        <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors leading-snug">
                                            {s.text}
                                        </span>
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
                            className="max-w-5xl mx-auto py-4 space-y-6"
                        >
                            {/* Compact signals banner at top of conversation */}
                            <SignalsBanner collapsed />

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
            <div className="sticky bottom-0 px-4 md:px-8 pb-2 pt-4 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/95 to-transparent">
                <div className="max-w-5xl mx-auto w-full">
                    <ChatInput onSubmit={handleSendMessage} disabled={isTyping} />
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
