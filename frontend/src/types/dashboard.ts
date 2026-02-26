export interface DashboardSummary {
    activeAnomalies: number;
    pendingActions: number;
    revenueGapPercent: number;
    lastUpdated: string;
}

export interface RevenueDataPoint {
    day: string;
    sales: number;
    traffic: number;
}

export interface KPIValue {
    kpiName: string;
    value: number;
    timestamp: string;
    dimensions: Record<string, string>;
}
