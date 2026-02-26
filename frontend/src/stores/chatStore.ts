import { create } from 'zustand';
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
        // empty for new sessions usually
        set({ messages: [] });
    },

    sendMessage: async (_diagnosisId, text) => {
        const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date().toISOString() };
        set({ messages: [...get().messages, newMsg], isTyping: true });

        // Mock bot response
        setTimeout(() => {
            let responseText = "Based on current sell-through rates, the collection will recover to 80% revenue within 48 hours if the Mumbai stock is transferred.";
            const lowerQuery = text.toLowerCase();

            if (lowerQuery.includes('market') || lowerQuery.includes('myntra')) {
                responseText = "Myntra inventory sync is currently lagging by 45 minutes. I've flagged this for the IT Ops team. Direct website traffic is still the priority source of lost revenue.";
            } else if (lowerQuery.includes('stock') || lowerQuery.includes('inventory')) {
                responseText = "We have 1,200 units of the Oversized Tee sitting in the Mumbai warehouse (Lower Parel). The cost to express-ship to Delhi is ₹12,000, but it saves an estimated ₹3.5 Lakhs in lost weekend sales.";
            } else if (lowerQuery.includes('influencer') || lowerQuery.includes('reels')) {
                responseText = "The spike is driven by @RiyaJain's reel (1.5M views) posted yesterday. It specifically features the 'Stitch Coord Set'. I recommend pausing 'Broad' audience ads and focusing only on Retargeting once stock arrives.";
            }

            get().addBotMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: responseText, timestamp: new Date().toISOString() });
        }, 2000);
    },

    addBotMessage: (message) => set({ messages: [...get().messages, message], isTyping: false }),
    clearMessages: () => set({ messages: [] })
}));
