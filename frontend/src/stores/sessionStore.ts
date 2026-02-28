import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { request } from '@/services/api/client';
import type { Session } from '@/types';

interface SessionState {
    sessions: Session[];
    activeSessionId: string | null;
    isLoading: boolean;
    hasFetched: boolean;

    fetchSessions: (force?: boolean) => Promise<void>;
    addSession: (query: string) => string;
    setActiveSession: (id: string | null) => void;
    renameSession: (id: string, newTitle: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            sessions: [],
            activeSessionId: null,
            isLoading: false,
            hasFetched: false,

            fetchSessions: async (force = false) => {
                // Skip if already fetched (unless forced)
                if (!force && get().hasFetched) return;

                set({ isLoading: true });
                try {
                    const data = await request<Array<{
                        _id: string;
                        query: string;
                        status: string;
                        startedAt: string;
                        completedAt?: string;
                    }>>('/analysis/sessions');

                    // Start with our persisted local sessions
                    let mergedSessions = [...get().sessions];
                    const seen = new Set<string>(mergedSessions.map(s => s.id));

                    // Add backend sessions
                    for (const s of data) {
                        if (seen.has(s._id)) continue;
                        seen.add(s._id);
                        const d = new Date(s.startedAt);
                        mergedSessions.push({
                            id: s._id,
                            query: s.query,
                            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            createdAt: s.startedAt,
                        });
                    }

                    // Sort by newest first
                    mergedSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                    set({ sessions: mergedSessions, isLoading: false, hasFetched: true });
                } catch (error) {
                    set({ isLoading: false });
                    console.error('Failed to fetch sessions', error);
                }
            },

            setActiveSession: (id) => set({ activeSessionId: id }),

            addSession: (query: string) => {
                const id = Date.now().toString();
                const now = new Date();
                const newSession: Session = {
                    id,
                    query,
                    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    createdAt: now.toISOString(),
                };
                set((state) => ({
                    sessions: [newSession, ...state.sessions],
                    activeSessionId: id,
                }));
                return id;
            },

            renameSession: async (id, newTitle) => {
                try {
                    // Try to rename on backend if it exists there, but don't block local rename
                    request(`/analysis/sessions/${id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ title: newTitle }),
                    }).catch(() => { });

                    set((state) => ({
                        sessions: state.sessions.map((s) => s.id === id ? { ...s, query: newTitle } : s),
                    }));
                } catch (error) {
                    console.error('Failed to rename session', error);
                }
            },

            deleteSession: async (id) => {
                try {
                    // Always cleanly await the backend deletion to ensure it's removed from database
                    await request(`/analysis/sessions/${id}`, {
                        method: 'DELETE',
                    });
                } catch (error) {
                    console.error('Backend deletion failed or session only existed locally', error);
                }

                // After confirmation from backend (or if it was only local), delete from local cache
                set((state) => ({
                    sessions: state.sessions.filter((s) => s.id !== id),
                    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
                }));
            },
        }),
        {
            name: 'session-storage',
            partialize: (state) => ({
                sessions: state.sessions.filter(s => !s.id.includes('dummy')) // Keep all valid sessions
            }),
        }
    )
);
