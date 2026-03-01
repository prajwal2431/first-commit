import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage } from '@/types';
import { tenantStorage } from './tenantStorage';
import { request } from '@/services/api/client';

interface ChatState {
    messagesBySession: Record<string, ChatMessage[]>;
    activeSessionId: string | null;
    isTyping: boolean;

    setActiveSession: (sessionId: string | null) => void;
    sendMessage: (sessionId: string, text: string) => Promise<void>;
    loadMessages: (sessionId: string) => Promise<void>;
    clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            messagesBySession: {},
            activeSessionId: null,
            isTyping: false,

            setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

            loadMessages: async (sessionId: string) => {
                if (!sessionId) return;
                try {
                    const data = await request<any>(`/analysis/result/${sessionId}`);
                    if (data && data.messages) {
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [sessionId]: data.messages,
                            }
                        }));
                    }
                } catch (err) {
                    console.error('Failed to load chat messages for session', err);
                }
            },

            sendMessage: async (sessionId: string, text: string) => {
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

                try {
                    const data = await request<any>('/chat/message', {
                        method: 'POST',
                        body: JSON.stringify({ message: text, sessionId: sid }),
                    });

                    const latestState = get();
                    const msgsAfterUser = latestState.messagesBySession[sid] || [];

                    if (data && data.response) {
                        const botMsg: ChatMessage = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            content: data.response,
                            timestamp: new Date().toISOString(),
                        };

                        set({
                            messagesBySession: {
                                ...latestState.messagesBySession,
                                [sid]: [...msgsAfterUser, botMsg]
                            },
                        });
                    }
                } catch (err) {
                    console.error('Failed to send message', err);
                } finally {
                    set({ isTyping: false });
                }
            },

            clearMessages: () => {
                set({ isTyping: false });
            },
        }),
        {
            name: 'chat-storage',
            partialize: (state) => ({ messagesBySession: state.messagesBySession }),
            storage: createJSONStorage(() => tenantStorage),
        }
    )
);

