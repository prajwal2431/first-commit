import { create } from 'zustand';
import { request } from '@/services/api/client';

interface LiveSignal {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    monitorType: string;
    title: string;
    description: string;
    suggestedQuery: string;
    evidenceSnippet: string;
    detectedAt: string;
}

interface KpiSummary {
    totalRevenue: number;
    revenueDelta: number;
    revenueDeltaPercent: number;
    totalOrders: number;
    ordersDelta: number;
    avgOrderValue: number;
    aovDelta: number;
    oosRate: number;
    oosDelta: number;
    returnRate: number;
    returnDelta: number;
    slaAdherence: number;
    slaDelta: number;
}

interface RevenueSeriesPoint {
    date: string;
    revenue: number;
    traffic: number;
    orders: number;
}

interface DashboardApiResponse {
    revenueAtRiskSeries: RevenueSeriesPoint[];
    liveSignals: LiveSignal[];
    kpiSummary: KpiSummary | null;
    lastComputedAt: string | null;
}

interface DashboardState {
    revenueAtRiskSeries: RevenueSeriesPoint[];
    liveSignals: LiveSignal[];
    kpiSummary: KpiSummary | null;
    lastComputedAt: string | null;
    isLoading: boolean;
    hasData: boolean;

    fetchDashboard: () => Promise<void>;
    refreshDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
    revenueAtRiskSeries: [],
    liveSignals: [],
    kpiSummary: null,
    lastComputedAt: null,
    isLoading: false,
    hasData: false,

    fetchDashboard: async () => {
        set({ isLoading: true });
        try {
            const data = await request<DashboardApiResponse>('/dashboard');
            set({
                revenueAtRiskSeries: data.revenueAtRiskSeries ?? [],
                liveSignals: data.liveSignals ?? [],
                kpiSummary: data.kpiSummary ?? null,
                lastComputedAt: data.lastComputedAt ?? null,
                isLoading: false,
                hasData: (data.revenueAtRiskSeries?.length ?? 0) > 0 || (data.liveSignals?.length ?? 0) > 0,
            });
        } catch (error) {
            set({ isLoading: false });
            console.error('Failed to fetch dashboard', error);
        }
    },

    refreshDashboard: async () => {
        set({ isLoading: true });
        try {
            const data = await request<DashboardApiResponse>('/dashboard/refresh', { method: 'POST' });
            set({
                revenueAtRiskSeries: data.revenueAtRiskSeries ?? [],
                liveSignals: data.liveSignals ?? [],
                kpiSummary: data.kpiSummary ?? null,
                lastComputedAt: data.lastComputedAt ?? null,
                isLoading: false,
                hasData: (data.revenueAtRiskSeries?.length ?? 0) > 0 || (data.liveSignals?.length ?? 0) > 0,
            });
        } catch (error) {
            set({ isLoading: false });
            console.error('Failed to refresh dashboard', error);
        }
    },
}));
