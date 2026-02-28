import { create } from 'zustand';
import type { DataSource } from '@/types';
import { request, ApiError } from '@/services/api/client';

interface BackendDataSource {
  _id: string;
  fileName: string;
  fileType: string;
  label?: string;
  domain?: string;
  mode?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'connected' | 'syncing' | 'disconnected';
  recordCount?: number;
  uploadedAt: string;
  errorMessage?: string;
}

function formatLastSync(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return d.toLocaleDateString();
}

function mapStatus(s: BackendDataSource['status']): DataSource['status'] {
  if (s === 'completed' || s === 'connected') return 'connected';
  if (s === 'processing' || s === 'pending' || s === 'syncing') return 'syncing';
  if (s === 'failed') return 'error';
  return 'disconnected';
}

function mapSource(b: BackendDataSource): DataSource {
  return {
    id: b._id,
    name: b.fileName,
    label: b.label || (b.fileName.length > 20 ? b.fileName.slice(0, 20) + '...' : b.fileName),
    type: b.fileType,
    domain: b.domain || 'Data Ingestion',
    mode: b.mode || 'Upload',
    status: mapStatus(b.status),
    lastSync: formatLastSync(b.uploadedAt),
    icon: b.fileType === 'excel' ? 'file' : b.fileType,
  };
}

interface SourcesState {
  sources: DataSource[];
  isLoading: boolean;
  uploadError: string | null;

  fetchSources: () => Promise<void>;
  uploadSource: (file: File, dataType?: string) => Promise<void>;
  connectSource: (sourceMeta: Partial<DataSource>) => Promise<void>;
  clearUploadError: () => void;
  disconnectSource: (id: string) => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  isLoading: false,
  uploadError: null,

  fetchSources: async () => {
    set({ isLoading: true });
    try {
      const list = (await request<BackendDataSource[]>('/data-sources')) ?? [];
      set({
        sources: list.map(mapSource),
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      console.error('Failed to fetch sources', err);
      set({ sources: [] });
    }
  },

  uploadSource: async (file: File, dataType?: string) => {
    set({ uploadError: null });
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'}/data-sources/upload`;
      const form = new FormData();
      form.append('file', file);
      if (dataType) form.append('dataType', dataType);
      const token = localStorage.getItem('rca_token');
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message);
      }
      await get().fetchSources();
    } catch (err) {
      const message = err instanceof ApiError && err.data?.message
        ? err.data.message
        : err instanceof Error ? err.message : 'Upload failed';
      set({ uploadError: message });
      throw err;
    }
  },

  clearUploadError: () => set({ uploadError: null }),

  connectSource: async (sourceMeta) => {
    // Generate a temporary mock source for immediate UI feedback
    const tempId = `temp-${Date.now()}`;
    const mockSource: DataSource = {
      id: tempId,
      name: sourceMeta.name || 'Unknown Source',
      label: sourceMeta.label || sourceMeta.name || 'Unknown Source',
      type: sourceMeta.type || 'api',
      domain: sourceMeta.domain || 'Data Ingestion',
      mode: sourceMeta.mode || 'API',
      status: 'syncing',
      lastSync: 'Just now',
      icon: sourceMeta.icon || 'database',
      ...sourceMeta
    };

    // Optimistically add to UI
    set((state) => ({ sources: [mockSource, ...state.sources] }));

    try {
      // Connect to the backend route we just created
      await request('/data-sources', {
        method: 'POST',
        body: JSON.stringify({
          name: sourceMeta.name || 'Unknown Source',
          label: sourceMeta.label || sourceMeta.name || 'Unknown Source',
          type: sourceMeta.type || 'api',
          domain: sourceMeta.domain || 'Data Ingestion',
          mode: sourceMeta.mode || 'API'
        })
      });

      // Refetch actual list which will include the new source from DB
      await get().fetchSources();
    } catch (err) {
      console.error('Failed to connect source:', err);
      // Remove the optimistic temp source on failure
      set((state) => ({ sources: state.sources.filter(s => s.id !== tempId) }));
      throw err;
    }
  },

  disconnectSource: async (id: string) => {
    // Optimistic UI updates
    set((state) => ({ sources: state.sources.filter(s => s.id !== id) }));

    // API Call
    try {
      await request(`/data-sources/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete source from backend:', err);
      // Refresh sources visually incase of backend failure
      await get().fetchSources();
    }
  },
}));
