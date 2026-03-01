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

export interface SignalThresholds {
    revenueDropWoW: number;
    revenueDropDoD: number;
    trafficUpCvrDown: {
        trafficDelta: number;
        revenueDelta: number;
    };
    aovCollapse: number;
    topSkuRevenueDrop: number;
    oosRateCritical: number;
    oosRateWarning: number;
    returnRateWarning: number;
    returnRateCritical: number;
    slaAdherenceWarning: number;
    slaAdherenceCritical: number;
    cancelRateWarning: number;
    cancelRateCritical: number;
    rtoRateWarning: number;
    rtoRateCritical: number;
    demandSpikeStdDevMultiplier: number;
    skuSpikeStdDevMultiplier: number;
    skuSpikeMinMultiplier: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
    revenueDropWoW: 15,
    revenueDropDoD: 10,
    trafficUpCvrDown: { trafficDelta: 10, revenueDelta: -10 },
    aovCollapse: 15,
    topSkuRevenueDrop: 20,
    oosRateCritical: 10,
    oosRateWarning: 5,
    returnRateWarning: 5,
    returnRateCritical: 15,
    slaAdherenceWarning: 90,
    slaAdherenceCritical: 80,
    cancelRateWarning: 3,
    cancelRateCritical: 10,
    rtoRateWarning: 8,
    rtoRateCritical: 15,
    demandSpikeStdDevMultiplier: 2.0,
    skuSpikeStdDevMultiplier: 2.5,
    skuSpikeMinMultiplier: 2.0,
};

interface SettingsState {
    departments: Department[];
    smtp: SmtpConfig | null;
    thresholds: SignalThresholds;
    isLoading: boolean;
    hasFetched: boolean;

    fetchSettings: () => Promise<void>;
    updateDepartments: (departments: Department[]) => Promise<void>;
    updateSmtp: (smtp: SmtpConfig) => Promise<void>;
    updateThresholds: (thresholds: SignalThresholds) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    departments: [],
    smtp: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
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
                thresholds: data.thresholds ? { ...DEFAULT_THRESHOLDS, ...data.thresholds } : { ...DEFAULT_THRESHOLDS },
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

    updateThresholds: async (thresholds) => {
        set({ isLoading: true });
        try {
            const data = await request<any>('/settings/thresholds', {
                method: 'PUT',
                body: JSON.stringify({ thresholds }),
            });
            set({
                thresholds: data.thresholds ? { ...DEFAULT_THRESHOLDS, ...data.thresholds } : { ...DEFAULT_THRESHOLDS },
                isLoading: false,
            });
        } catch (error) {
            console.error('Failed to update thresholds:', error);
            set({ isLoading: false });
            throw error;
        }
    },
}));
