import { create } from 'zustand';
import { request } from '@/services/api/client';

interface Department {
    id: string;
    name: string;
    email: string;
}

interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
}

interface SettingsState {
    departments: Department[];
    smtp: SmtpConfig | null;
    isLoading: boolean;
    hasFetched: boolean;

    fetchSettings: () => Promise<void>;
    updateDepartments: (departments: Department[]) => Promise<void>;
    updateSmtp: (smtp: SmtpConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    departments: [],
    smtp: null,
    isLoading: false,
    hasFetched: false,

    fetchSettings: async () => {
        if (get().hasFetched) return;
        set({ isLoading: true });
        try {
            const data = await request<any>('/settings');
            set({
                departments: data.departments ?? [],
                smtp: data.smtp ?? null,
                isLoading: false,
                hasFetched: true,
            });
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            set({ isLoading: false });
        }
    },

    updateDepartments: async (departments) => {
        set({ isLoading: true });
        try {
            const data = await request<any>('/settings/departments', {
                method: 'PUT',
                body: JSON.stringify({ departments }),
            });
            set({ departments: data.departments, isLoading: false });
        } catch (error) {
            console.error('Failed to update departments:', error);
            set({ isLoading: false });
            throw error;
        }
    },

    updateSmtp: async (smtp) => {
        set({ isLoading: true });
        try {
            const data = await request<any>('/settings/smtp', {
                method: 'PUT',
                body: JSON.stringify({ smtp }),
            });
            set({ smtp: data.smtp, isLoading: false });
        } catch (error) {
            console.error('Failed to update SMTP:', error);
            set({ isLoading: false });
            throw error;
        }
    },
}));
