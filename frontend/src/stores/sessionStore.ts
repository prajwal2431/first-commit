import { create } from 'zustand';
import { request } from '@/services/api/client';
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
        try {
            const data = await request<Array<{
                _id: string;
                query: string;
                status: string;
                startedAt: string;
                completedAt?: string;
            }>>('/analysis/sessions');

            const sessions: Session[] = data.map((s) => {
                const d = new Date(s.startedAt);
                return {
                    id: s._id,
                    query: s.query,
                    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    createdAt: s.startedAt,
                };
            });

            set({ sessions, isLoading: false });
        } catch (error) {
            set({ isLoading: false });
            console.error('Failed to fetch sessions', error);
        }
    },

    setActiveSession: (id) => set({ activeSessionId: id }),

    renameSession: async (id, newTitle) => {
        set((state) => ({
            sessions: state.sessions.map((s) => s.id === id ? { ...s, query: newTitle } : s),
        }));
    },

    deleteSession: async (id) => {
        set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== id),
            activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        }));
    },
}));
