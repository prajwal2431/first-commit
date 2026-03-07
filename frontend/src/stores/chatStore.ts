import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage } from '@/types';
import { tenantStorage } from './tenantStorage';
import { request } from '@/services/api/client';

interface ChatState {
    messagesBySession: Record<string, ChatMessage[]>;
    activeSessionId: string | null;
    isTyping: boolean;
    isChatOpen: boolean;

    setChatOpen: (isOpen: boolean) => void;
    setActiveSession: (sessionId: string | null) => void;
    sendMessage: (sessionId: string, text: string, options?: { sheet_url?: string }) => Promise<{ sessionId?: string } | void>;
    loadMessages: (sessionId: string) => Promise<void>;
    clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
    persist(
        (set, get) => ({
            messagesBySession: {},
            activeSessionId: null,
            isTyping: false,
            isChatOpen: true,

            setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
            setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

            loadMessages: async (sessionId: string) => {
                if (!sessionId) return;
                // Skip API call for client-generated temp ids (e.g. Date.now()); backend expects MongoDB ObjectId
                const isMongoId = /^[a-fA-F0-9]{24}$/.test(sessionId);
                if (!isMongoId) return;
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

            sendMessage: async (sessionId: string, text: string, options?: { sheet_url?: string }) => {
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

                const body: { message: string; sessionId: string; sheet_url?: string } = { message: text, sessionId: sid };
                if (options?.sheet_url) body.sheet_url = options.sheet_url;

                try {
                    const data = await request<any>('/chat/message', {
                        method: 'POST',
                        body: JSON.stringify(body),
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

                        const realSessionId = data.sessionId ?? data.analysisId;
                        const messagesForSession = [...msgsAfterUser, botMsg];

                        // If backend returned a different session id (e.g. MongoDB ObjectId), migrate messages and use it
                        if (realSessionId && realSessionId !== sid) {
                            set({
                                messagesBySession: {
                                    ...latestState.messagesBySession,
                                    [sid]: messagesForSession,
                                    [realSessionId]: messagesForSession,
                                },
                                activeSessionId: realSessionId,
                            });
                        } else {
                            set({
                                messagesBySession: {
                                    ...latestState.messagesBySession,
                                    [sid]: messagesForSession,
                                },
                            });
                        }
                    }
                    return { sessionId: data?.sessionId ?? data?.analysisId };
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

