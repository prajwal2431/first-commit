import type { Action } from './action';

export interface DiagnosisResult {
    id: string;
    query: string;
    status: 'analyzing' | 'completed' | 'error';
    rootCause: RootCause | null;
    impactMetrics: ImpactMetrics | null;
    actions: Action[];
    externalFactorsData: ExternalFactor[];
    geographicData: GeographicInsight | null;
    createdAt: string;
}

export interface DiagnosisProgress {
    diagnosisId: string;
    currentStep: number;
    steps: DiagnosisStep[];
    status: 'analyzing' | 'completed' | 'error';
}

export interface DiagnosisStep {
    step: number;
    label: string;
    status: 'waiting' | 'processing' | 'done';
}

export interface RootCause {
    id: string;
    title: string;
    description: string;
    confidenceScore: number;
    contributingFactors: ContributingFactor[];
    evidenceChain: Evidence[];
}

export interface ContributingFactor {
    icon: string;
    title: string;
    description: string;
}

export interface Evidence {
    dataSource: string;
    query: string;
    result: any;
    interpretation: string;
    timestamp: string;
}

export interface ImpactMetrics {
    lostRevenue: { value: string; trend: 'up' | 'down' };
    conversion: { value: string; trend: 'up' | 'down' };
    stockHQ: { value: string; sub: string };
    stockTarget: { value: string; sub: string };
}

export interface ExternalFactor {
    time: string;
    [key: string]: number | string;
}

export interface GeographicInsight {
    origin: { label: string; status: string; };
    destination: { label: string; status: string; };
    narrative: string;
}
