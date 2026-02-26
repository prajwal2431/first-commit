import { create } from 'zustand';
import type { DataSource } from '@/types';

interface SourcesState {
    sources: DataSource[];
    isLoading: boolean;

    fetchSources: () => Promise<void>;
    connectSource: (type: string, name: string) => Promise<void>;
    disconnectSource: (id: string) => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
    sources: [],
    isLoading: false,

    fetchSources: async () => {
        set({ isLoading: true });
        // Mock API
        setTimeout(() => {
            set({
                sources: [
                    { id: 'src-1', name: 'Shopify India', type: 'ecommerce', status: 'connected', lastSync: '2 mins ago', icon: 'shopify' },
                    { id: 'src-2', name: 'Unicommerce WMS', type: 'wms', status: 'connected', lastSync: '5 mins ago', icon: 'warehouse' },
                    { id: 'src-3', name: 'Meta Ads', type: 'marketing', status: 'connected', lastSync: '10 mins ago', icon: 'meta' }
                ],
                isLoading: false
            });
        }, 800);
    },

    connectSource: async (type, name) => {
        // Mock connection
        const newSource: DataSource = {
            id: `src-${Date.now()}`,
            name,
            type,
            status: 'syncing',
            lastSync: 'Just now',
            icon: type
        };

        set({ sources: [...get().sources, newSource] });

        setTimeout(() => {
            set((state) => ({
                sources: state.sources.map(s => s.id === newSource.id ? { ...s, status: 'connected' } : s)
            }));
        }, 2000);
    },

    disconnectSource: async (id) => {
        set((state) => ({
            sources: state.sources.map(s => s.id === id ? { ...s, status: 'disconnected' } : s)
        }));
    }
}));
