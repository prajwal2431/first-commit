import { create } from 'zustand';
import type { RootCause, ImpactMetrics, Action, GeographicInsight } from '@/types';

interface DiagnosisState {
    currentQuery: string;
    diagnosisId: string | null;
    status: 'idle' | 'analyzing' | 'completed' | 'error';
    analysisProgress: number;

    rootCause: RootCause | null;
    impactMetrics: ImpactMetrics | null;
    actions: Action[];
    geographicData: GeographicInsight | null;

    startDiagnosis: (query: string) => Promise<string>;
    fetchResult: (id: string) => Promise<void>;
    updateProgress: (step: number) => void;
    reset: () => void;
}

export const useDiagnosisStore = create<DiagnosisState>((set) => ({
    currentQuery: '',
    diagnosisId: null,
    status: 'idle',
    analysisProgress: 0,

    rootCause: null,
    impactMetrics: null,
    actions: [],
    geographicData: null,

    startDiagnosis: async (query) => {
        // Generate mock ID
        const id = Date.now().toString();
        set({
            currentQuery: query,
            diagnosisId: id,
            status: 'analyzing',
            analysisProgress: 0
        });

        // Mock progress steps
        setTimeout(() => set({ analysisProgress: 1 }), 1000);
        setTimeout(() => set({ analysisProgress: 2 }), 2500);
        setTimeout(() => set({ analysisProgress: 3 }), 4000);
        setTimeout(() => {
            set({ status: 'completed' });
        }, 5500);

        return id;
    },

    fetchResult: async (_id) => {
        // Mock the data
        set({
            rootCause: {
                id: 'mock-rc-1',
                title: 'Root Cause Identified',
                description: 'Inventory Mismatch: Viral demand in Delhi meets 0 Stock.',
                confidenceScore: 0.98,
                contributingFactors: [
                    { icon: 'instagram', title: 'Viral Trigger', description: 'Reel by @RiyaJain (Delhi-based) hit 1.5M views. Drove 300% traffic spike from North India.' },
                    { icon: 'box', title: 'Inventory Blindspot', description: 'Delhi Fulfillment Center is OOS. 1,200 units are stuck in Mumbai HQ not allocated to online orders.' }
                ],
                evidenceChain: []
            },
            impactMetrics: {
                lostRevenue: { value: '₹3.5L', trend: 'up' },
                conversion: { value: '0.8%', trend: 'down' },
                stockHQ: { value: '1,200', sub: 'Units Idle' },
                stockTarget: { value: '0', sub: 'Stockout' }
            },
            actions: [
                { id: 'act-1', rootCauseId: 'mock-rc-1', anomalyId: 'an-1', actionType: 'replenish_inventory', title: 'Express Allocation', description: 'Air-ship 500 units from Mumbai HQ to Delhi Hub (Cost: ₹12k).', priority: 'high', suggestedOwner: 'admin', status: 'pending', icon: 'truck', context: {}, createdAt: new Date().toISOString() },
                { id: 'act-2', rootCauseId: 'mock-rc-1', anomalyId: 'an-1', actionType: 'investigate_sku_listing', title: 'Ad Optimization', description: "Pause 'Broad' audience Meta Ads in Delhi to stop burning budget on OOS.", priority: 'medium', suggestedOwner: 'admin', status: 'pending', icon: 'zap', context: {}, createdAt: new Date().toISOString() },
                { id: 'act-3', rootCauseId: 'mock-rc-1', anomalyId: 'an-1', actionType: 'escalate_ops_issue', title: 'Customer Retention', description: "Enable 'Notify Me' & send 'Back in Stock' WhatsApp blast to waitlist.", priority: 'low', suggestedOwner: 'admin', status: 'pending', icon: 'anchor', context: {}, createdAt: new Date().toISOString() }
            ],
            geographicData: {
                origin: { label: 'Mumbai (HQ)', status: 'Overstock' },
                destination: { label: 'Delhi (NCR)', status: 'Stockout' },
                narrative: 'Demand is concentrated in North India (Delhi/NCR) due to influencer trend. Supply is trapped in West (Mumbai).'
            },
            status: 'completed'
        })
    },

    updateProgress: (step) => set({ analysisProgress: step }),

    reset: () => set({
        currentQuery: '',
        diagnosisId: null,
        status: 'idle',
        analysisProgress: 0,
        rootCause: null,
        impactMetrics: null,
        actions: [],
        geographicData: null,
    })
}));
