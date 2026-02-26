export interface Anomaly {
    id: string;
    kpiName: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'detected' | 'analyzing' | 'resolved' | 'dismissed';
    currentValue: number;
    expectedValue: number;
    deviationPercent: number;
    dimensions: Record<string, string>;
    detectedAt: string;
    message?: string;
}
