import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '@/types';

interface ChatState {
    messagesBySession: Record<string, ChatMessage[]>;
    activeSessionId: string | null;
    isTyping: boolean;

    setActiveSession: (sessionId: string | null) => void;
    sendMessage: (sessionId: string, text: string) => void;
    clearMessages: (sessionId: string) => void;
}

const HARDCODED_RESPONSES = [
    "🤖 The AI agent is not ready yet. We're working hard on bringing intelligence to this chat. Stay tuned!",
    "⚙️ Agent is currently offline. This feature is under active development — check back soon!",
    "🚧 Our AI assistant is being built. For now, please use the Intelligence page to run diagnoses.",
];

let responseIndex = 0;

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            messagesBySession: {},
            activeSessionId: null,
            isTyping: false,

            setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

            sendMessage: (sessionId: string, text: string) => {
                const state = get();
                const sid = sessionId;

                const userMsg: ChatMessage = {
                    id: Date.now().toString(),
                    role: 'user',
                    content: text,
                    timestamp: new Date().toISOString(),
                };

                const currentMsgs = state.messagesBySession[sid] || [];

                set({
                    messagesBySession: {
                        ...state.messagesBySession,
                        [sid]: [...currentMsgs, userMsg]
                    },
                    isTyping: true
                });

                // Simulate typing delay, then respond
                setTimeout(() => {
                    const latestState = get();

                    const botMsg: ChatMessage = {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        content: HARDCODED_RESPONSES[responseIndex % HARDCODED_RESPONSES.length],
                        timestamp: new Date().toISOString(),
                    };
                    responseIndex++;

                    const msgsAfterUser = latestState.messagesBySession[sid] || [];
                    set({
                        messagesBySession: {
                            ...latestState.messagesBySession,
                            [sid]: [...msgsAfterUser, botMsg]
                        },
                        isTyping: false
                    });
                }, 1500);
            },

            clearMessages: (sessionId: string) => {
                // We keep the history in messagesBySession, we just clear typing state
                set({ isTyping: false });
            },
        }),
        {
            name: 'chat-storage',
            partialize: (state) => ({ messagesBySession: state.messagesBySession }),
        }
    )
);

