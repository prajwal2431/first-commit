import { create } from 'zustand';
import type { DataSource } from '@/types';
import { request, uploadFile, ApiError } from '@/services/api/client';

interface BackendDataSource {
  _id: string;
  fileName: string;
  fileType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
  if (s === 'completed') return 'connected';
  if (s === 'processing' || s === 'pending') return 'syncing';
  if (s === 'failed') return 'error';
  return 'disconnected';
}

function mapSource(b: BackendDataSource): DataSource {
  return {
    id: b._id,
    name: b.fileName,
    type: b.fileType,
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
  clearUploadError: () => void;
  disconnectSource: (id: string) => void;
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

  disconnectSource: () => {
    // Optional: call DELETE /api/data-sources/:id when backend supports it
    set((state) => ({ sources: state.sources }));
  },
}));
