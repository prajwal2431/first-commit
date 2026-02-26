import { create } from 'zustand';
import type { Anomaly, DashboardSummary, RevenueDataPoint } from '../types';

interface DashboardState {
    anomalies: Anomaly[];
    revenueChartData: RevenueDataPoint[];
    summary: DashboardSummary | null;
    isLoading: boolean;
    lastUpdated: Date | null;

    fetchDashboard: () => Promise<void>;
    fetchRevenueChart: (range?: string) => Promise<void>;
    addAnomaly: (anomaly: Anomaly) => void;
    dismissAnomaly: (id: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
    anomalies: [],
    revenueChartData: [],
    summary: null,
    isLoading: false,
    lastUpdated: null,

    fetchDashboard: async () => {
        set({ isLoading: true });
        try {
            // Mocking API call for now
            await new Promise((resolve) => setTimeout(resolve, 1000));
            set({
                isLoading: false,
                lastUpdated: new Date()
            });
        } catch (error) {
            set({ isLoading: false });
            console.error('Failed to fetch dashboard', error);
        }
    },

    fetchRevenueChart: async (range) => {
        // Implementation
        console.log('Fetching revenue chart for range', range);
    },

    addAnomaly: (anomaly) => set((state) => ({
        anomalies: [anomaly, ...state.anomalies]
    })),

    dismissAnomaly: async (id) => {
        set((state) => ({
            anomalies: state.anomalies.filter((a) => a.id !== id)
        }));
    }
}));
