import { create } from 'zustand';
import { request } from '@/services/api/client';
import type { RootCause, ImpactMetrics, Action, GeographicInsight } from '@/types';

interface AnalysisStep {
    stage: number;
    label: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    detail?: string;
}

interface DiagnosisState {
    currentQuery: string;
    diagnosisId: string | null;
    status: 'idle' | 'analyzing' | 'completed' | 'error';
    analysisProgress: number;
    analysisSteps: AnalysisStep[];

    rootCause: RootCause | null;
    impactMetrics: ImpactMetrics | null;
    actions: Action[];
    geographicData: GeographicInsight | null;
    chartData: { revenueVsTraffic: Array<{ date: string; revenue: number; traffic: number }> };

    startDiagnosis: (query: string) => Promise<string>;
    fetchResult: (id: string) => Promise<void>;
    updateProgress: (step: number) => void;
    reset: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const useDiagnosisStore = create<DiagnosisState>((set, get) => ({
    currentQuery: '',
    diagnosisId: null,
    status: 'idle',
    analysisProgress: 0,
    analysisSteps: [],

    rootCause: null,
    impactMetrics: null,
    actions: [],
    geographicData: null,
    chartData: { revenueVsTraffic: [] },

    startDiagnosis: async (query) => {
        set({
            currentQuery: query,
            status: 'analyzing',
            analysisProgress: 0,
            analysisSteps: [],
        });

        try {
            const data = await request<{ analysisId: string }>('/analysis/start', {
                method: 'POST',
                body: JSON.stringify({ query }),
            });

            const analysisId = data.analysisId;
            set({ diagnosisId: analysisId });

            const token = localStorage.getItem('rca_token');
            const eventSource = new EventSource(
                `${API_BASE_URL}/analysis/stream/${analysisId}`,
            );

            eventSource.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (payload.type === 'progress') {
                        const step = payload.step as AnalysisStep;
                        set((state) => {
                            const steps = [...state.analysisSteps];
                            const idx = steps.findIndex((s) => s.stage === step.stage);
                            if (idx >= 0) steps[idx] = step;
                            else steps.push(step);

                            const completedCount = steps.filter((s) => s.status === 'completed').length;
                            return { analysisSteps: steps, analysisProgress: completedCount };
                        });
                    } else if (payload.type === 'complete') {
                        eventSource.close();
                        const result = payload.result;
                        applyResult(set, result);
                    } else if (payload.type === 'error') {
                        eventSource.close();
                        set({ status: 'error' });
                    }
                } catch { /* ignore parse errors */ }
            };

            eventSource.onerror = () => {
                eventSource.close();
                setTimeout(() => get().fetchResult(analysisId), 1000);
            };

            return analysisId;
        } catch (error) {
            set({ status: 'error' });
            console.error('Failed to start diagnosis', error);
            return '';
        }
    },

    fetchResult: async (id) => {
        try {
            const data = await request<any>(`/analysis/result/${id}`);
            if (data.status === 'completed' && data.result) {
                applyResult(set, data.result);
            } else if (data.status === 'running') {
                setTimeout(() => get().fetchResult(id), 2000);
            } else if (data.status === 'failed') {
                set({ status: 'error' });
            }
        } catch (error) {
            set({ status: 'error' });
            console.error('Failed to fetch result', error);
        }
    },

    updateProgress: (step) => set({ analysisProgress: step }),

    reset: () => set({
        currentQuery: '',
        diagnosisId: null,
        status: 'idle',
        analysisProgress: 0,
        analysisSteps: [],
        rootCause: null,
        impactMetrics: null,
        actions: [],
        geographicData: null,
        chartData: { revenueVsTraffic: [] },
    }),
}));

function applyResult(set: any, result: any) {
    const rootCauses = result.rootCauses ?? [];
    const primary = rootCauses[0] ?? null;

    const rootCause: RootCause | null = primary ? {
        id: primary.id,
        title: primary.title,
        description: primary.description,
        confidenceScore: primary.confidence,
        contributingFactors: (primary.contributingFactors ?? []).map((f: string, i: number) => ({
            icon: i === 0 ? 'alert' : 'box',
            title: `Contributing Factor ${i + 1}`,
            description: f,
        })),
        evidenceChain: [],
    } : null;

    const impact = result.businessImpact ?? {};
    const impactMetrics: ImpactMetrics | null = {
        lostRevenue: { value: impact.lostRevenueFormatted ?? '₹0', trend: 'down' as const },
        conversion: { value: `${impact.conversionDrop?.toFixed(1) ?? '0'}%`, trend: 'down' as const },
        stockHQ: { value: String(impact.stockAtHQ ?? 0), sub: 'Units at HQ' },
        stockTarget: { value: String(impact.stockAtTarget ?? 0), sub: impact.stockAtTarget === 0 ? 'Stockout' : 'Units' },
    };

    const actions: Action[] = (result.actions ?? []).map((a: any) => ({
        id: a.id,
        rootCauseId: '',
        anomalyId: '',
        actionType: a.type ?? 'investigate_sku_listing',
        title: a.title,
        description: a.description,
        priority: a.priority,
        suggestedOwner: a.owner,
        status: 'pending',
        icon: a.priority === 'urgent' ? 'truck' : a.priority === 'high' ? 'zap' : 'anchor',
        context: { effort: a.effort, expectedImpact: a.expectedImpact },
        createdAt: new Date().toISOString(),
    }));

    const geo = result.geoOpportunity;
    const geographicData: GeographicInsight | null = geo ? {
        origin: { label: geo.originLabel, status: 'Overstock' },
        destination: { label: geo.destinationLabel, status: 'Stockout' },
        narrative: geo.narrative,
    } : null;

    set({
        rootCause,
        impactMetrics,
        actions,
        geographicData,
        chartData: result.charts ?? { revenueVsTraffic: [] },
        status: 'completed',
        analysisProgress: 4,
    });
}
