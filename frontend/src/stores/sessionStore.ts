import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { request } from '@/services/api/client';
import type { Session } from '@/types';
import { tenantStorage } from './tenantStorage';

interface SessionState {
    sessions: Session[];
    deletedSessionIds: string[];
    activeSessionId: string | null;
    isLoading: boolean;
    hasFetched: boolean;

    fetchSessions: (force?: boolean) => Promise<void>;
    addSession: (query: string) => string;
    replaceSessionId: (oldId: string, newId: string) => void;
    setActiveSession: (id: string | null) => void;
    renameSession: (id: string, newTitle: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
}

function isMongoId(id: string): boolean {
    return /^[a-fA-F0-9]{24}$/.test(id);
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            sessions: [],
            deletedSessionIds: [],
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

                    const deleted = new Set(get().deletedSessionIds);
                    const localOnlySessions = get().sessions.filter((s) => !isMongoId(s.id) && !deleted.has(s.id));
                    const backendSessions: Session[] = [];

                    for (const s of data) {
                        if (deleted.has(s._id)) continue;
                        const d = new Date(s.startedAt);
                        backendSessions.push({
                            id: s._id,
                            query: s.query,
                            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            createdAt: s.startedAt,
                        });
                    }

                    const mergedSessions = [...localOnlySessions, ...backendSessions];

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

            replaceSessionId: (oldId: string, newId: string) => {
                const deleted = new Set(get().deletedSessionIds);
                if (deleted.has(oldId) || deleted.has(newId)) return;

                set((state) => ({
                    sessions: state.sessions.map((s) =>
                        s.id === oldId ? { ...s, id: newId } : s
                    ),
                    activeSessionId: state.activeSessionId === oldId ? newId : state.activeSessionId,
                }));
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
                set((state) => {
                    const deleted = new Set(state.deletedSessionIds);
                    deleted.add(id);
                    return {
                        sessions: state.sessions.filter((s) => s.id !== id),
                        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
                        deletedSessionIds: Array.from(deleted).slice(-200),
                    };
                });

                try {
                    if (isMongoId(id)) {
                        await request(`/analysis/sessions/${id}`, {
                            method: 'DELETE',
                        });
                    }
                } catch (error) {
                    console.error('Backend deletion failed', error);
                }
            },
        }),
        {
            name: 'session-storage',
            partialize: (state) => ({
                sessions: state.sessions.filter(s => !s.id.includes('dummy')), // Keep all valid sessions
                deletedSessionIds: state.deletedSessionIds.slice(-200),
            }),
            storage: createJSONStorage(() => tenantStorage),
        }
    )
);
