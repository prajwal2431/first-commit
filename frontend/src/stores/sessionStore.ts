import { create } from 'zustand';
import type { Session } from '@/types';

interface SessionState {
    sessions: Session[];
    activeSessionId: string | null;
    isLoading: boolean;

    fetchSessions: () => Promise<void>;
    setActiveSession: (id: string | null) => void;
    renameSession: (id: string, newTitle: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
    sessions: [],
    activeSessionId: null,
    isLoading: false,

    fetchSessions: async () => {
        set({ isLoading: true });
        // Mock API
        setTimeout(() => {
            set({
                sessions: [
                    { id: 'sess-1', query: "Stockout spike for Disney Stitch Tee in Delhi", date: "Oct 24", createdAt: new Date().toISOString() },
                    { id: 'sess-2', query: "Myntra marketplace sync latency", date: "Oct 23", createdAt: new Date().toISOString() }
                ],
                isLoading: false
            });
        }, 500);
    },

    setActiveSession: (id) => set({ activeSessionId: id }),

    renameSession: async (id, newTitle) => {
        set((state) => ({
            sessions: state.sessions.map((s) => s.id === id ? { ...s, query: newTitle } : s)
        }));
    },

    deleteSession: async (id) => {
        set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== id),
            activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
        }));
    }
}));
