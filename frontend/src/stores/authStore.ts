import { create } from 'zustand';

interface TenantInfo {
  id: string;
  companyName: string;
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
  tenant: TenantInfo;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (companyName: string, tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadSession: () => Promise<void>;
  clearError: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

async function readJsonOrThrowHtml(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  const bodyText = await res.text();

  if (!contentType.includes('application/json')) {
    const isHtml = bodyText.trimStart().startsWith('<!DOCTYPE') || bodyText.trimStart().startsWith('<html');
    if (isHtml) {
      throw new Error('API returned HTML instead of JSON. Check VITE_API_BASE_URL and Amplify/App Runner routing.');
    }
    throw new Error('API returned a non-JSON response.');
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error('API returned invalid JSON.');
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('rca_token'),
  user: null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await readJsonOrThrowHtml(res);
      if (!res.ok) throw new Error(data.message || 'Login failed');

      localStorage.setItem('rca_token', data.token);
      set({ token: data.token, user: data.user, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  register: async (companyName, tenantId, email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, tenantId, email, password }),
      });
      const data = await readJsonOrThrowHtml(res);
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      localStorage.setItem('rca_token', data.token);
      set({ token: data.token, user: data.user, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('rca_token');
    set({ token: null, user: null });
    window.location.href = '/';
  },

  loadSession: async () => {
    const token = get().token;
    if (!token) return;

    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('rca_token');
        set({ token: null, user: null, loading: false });
        return;
      }
      const data = await readJsonOrThrowHtml(res);
      set({ user: data.user, loading: false });
    } catch {
      localStorage.removeItem('rca_token');
      set({ token: null, user: null, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
