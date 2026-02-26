import { create } from 'zustand';

export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface SSEState {
    status: SSEConnectionStatus;
    lastEvent: any | null;
    error: string | null;

    setStatus: (status: SSEConnectionStatus) => void;
    setLastEvent: (event: any) => void;
    setError: (error: string | null) => void;
}

export const useSSEStore = create<SSEState>((set) => ({
    status: 'disconnected',
    lastEvent: null,
    error: null,

    setStatus: (status) => set({ status }),
    setLastEvent: (lastEvent) => set({ lastEvent }),
    setError: (error) => set({ error }),
}));
