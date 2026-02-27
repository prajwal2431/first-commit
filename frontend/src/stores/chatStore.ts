import { create } from 'zustand';
import { request } from '@/services/api/client';
import type { ChatMessage } from '@/types';

interface ChatState {
    messages: ChatMessage[];
    isTyping: boolean;
    isLoading: boolean;

    loadHistory: (diagnosisId: string) => Promise<void>;
    sendMessage: (diagnosisId: string, text: string) => Promise<void>;
    addBotMessage: (message: ChatMessage) => void;
    clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    isTyping: false,
    isLoading: false,

    loadHistory: async (_diagnosisId) => {
        set({ messages: [] });
    },

    sendMessage: async (_diagnosisId, text) => {
        const newMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        };
        set({ messages: [...get().messages, newMsg], isTyping: true });

        try {
            const data = await request<{ response: string; type: string; analysisId?: string }>(
                '/chat/message',
                {
                    method: 'POST',
                    body: JSON.stringify({ message: text }),
                }
            );

            get().addBotMessage({
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            get().addBotMessage({
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                timestamp: new Date().toISOString(),
            });
        }
    },

    addBotMessage: (message) => set({ messages: [...get().messages, message], isTyping: false }),
    clearMessages: () => set({ messages: [] }),
}));
