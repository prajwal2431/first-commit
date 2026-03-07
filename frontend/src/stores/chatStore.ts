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
                    const realSessionId = data?.sessionId ?? data?.analysisId;

                    // Support multiple responses (e.g. demo mode: "thinking" then full analysis)
                    const parts: string[] = Array.isArray(data?.responses) && data.responses.length > 0
                        ? data.responses
                        : (data?.response ? [data.response] : []);

                    if (parts.length > 0) {
                        const delayBetweenParts = 1800;

                        for (let i = 0; i < parts.length; i++) {
                            if (i > 0) {
                                await new Promise((r) => setTimeout(r, delayBetweenParts));
                            }
                            const botMsg: ChatMessage = {
                                id: `${Date.now() + i}`,
                                role: 'assistant',
                                content: parts[i],
                                timestamp: new Date().toISOString(),
                            };
                            const currentMsgs = get().messagesBySession[sid] || get().messagesBySession[realSessionId] || msgsAfterUser;
                            const messagesForSession = [...currentMsgs, botMsg];

                            set({
                                messagesBySession: {
                                    ...get().messagesBySession,
                                    [sid]: messagesForSession,
                                    ...(realSessionId && realSessionId !== sid ? { [realSessionId]: messagesForSession } : {}),
                                },
                                ...(realSessionId ? { activeSessionId: realSessionId } : {}),
                                isTyping: i < parts.length - 1,
                            });
                        }
                    }

                    set({ isTyping: false });
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

