/**
 * Context Builder for Proactive RCA
 *
 * Assembles a rich context string from all available data sources
 * for use in proactive RCA agent prompts.
 */

import { DashboardState, LiveSignal } from '../../models/DashboardState';
import { OrgSettings, DEFAULT_PROACTIVE_CONFIG } from '../../models/OrgSettings';
import { detectTrendDrifts, TrendDrift } from './trendDetector';
import { correlateSignals, CorrelatedInsight } from './correlator';
import { generatePredictions, Prediction } from './predictor';

/* ── Public types ────────────────────────────────────────────────── */

export interface ProactiveContext {
    organizationId: string;
    liveSignals: LiveSignal[];
    kpiSnapshot: string;
    trendDrifts: TrendDrift[];
    correlations: CorrelatedInsight[];
    predictions: Prediction[];
    contextString: string; // formatted string for the LLM prompt
}

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Builds a comprehensive context for proactive RCA runs.
 * Pulls together dashboard state, trend analysis, correlations, and predictions.
 */
export async function buildProactiveContext(
    organizationId: string,
    opts?: {
        signalIds?: string[];     // focus on specific signals
        skipTrends?: boolean;
        skipPredictions?: boolean;
    }
): Promise<ProactiveContext> {
    // 1. Load current dashboard state
    const dashState = await DashboardState.findOne({ organizationId }).lean();
    const liveSignals = (dashState?.liveSignals ?? []) as LiveSignal[];
    const kpi = dashState?.kpiSummary;

    // If specific signalIds requested, filter
    const focusSignals = opts?.signalIds
        ? liveSignals.filter((s) => opts.signalIds!.includes(s.id))
        : liveSignals;

    // 2. Load org config
    const settings = await OrgSettings.findOne({ organizationId }).lean();
    const proactiveConfig = settings?.proactiveConfig ?? DEFAULT_PROACTIVE_CONFIG;

    // 3. Run proactive analyses in parallel
    const [trendDrifts, predictions] = await Promise.all([
        proactiveConfig.enableTrendDetection && !opts?.skipTrends
            ? detectTrendDrifts(organizationId)
            : Promise.resolve([]),
        proactiveConfig.enablePredictions && !opts?.skipPredictions
            ? generatePredictions(organizationId)
            : Promise.resolve([]),
    ]);

    // 4. Correlate signals (synchronous, rules-based)
    const correlations = correlateSignals(liveSignals);

    // 5. Build formatted context string for LLM
    const contextString = formatContext(focusSignals, kpi, trendDrifts, correlations, predictions);

    return {
        organizationId,
        liveSignals: focusSignals,
        kpiSnapshot: kpi ? formatKpiSnapshot(kpi) : 'No KPI data available.',
        trendDrifts,
        correlations,
        predictions,
        contextString,
    };
}

/* ── Formatters ──────────────────────────────────────────────────── */

function formatKpiSnapshot(kpi: any): string {
    const lines = [
        `Total Revenue: ₹${(kpi.totalRevenue || 0).toLocaleString('en-IN')} (${kpi.revenueDeltaPercent > 0 ? '+' : ''}${kpi.revenueDeltaPercent?.toFixed(1) ?? '?'}% vs baseline)`,
        `Total Orders: ${(kpi.totalOrders || 0).toLocaleString('en-IN')} (${kpi.ordersDelta > 0 ? '+' : ''}${kpi.ordersDelta ?? '?'})`,
        `AOV: ₹${(kpi.avgOrderValue || 0).toFixed(0)} (${kpi.aovDelta > 0 ? '+' : ''}${kpi.aovDelta?.toFixed(1) ?? '?'}%)`,
        `OOS Rate: ${(kpi.oosRate || 0).toFixed(1)}%`,
        `Return Rate: ${(kpi.returnRate || 0).toFixed(1)}%`,
        `SLA Adherence: ${(kpi.slaAdherence || 0).toFixed(1)}%`,
        `Revenue at Risk: ₹${(kpi.revenueAtRiskTotal || 0).toLocaleString('en-IN')}`,
    ];
    return lines.join('\n');
}

function formatContext(
    signals: LiveSignal[],
    kpi: any,
    trends: TrendDrift[],
    correlations: CorrelatedInsight[],
    predictions: Prediction[],
): string {
    const sections: string[] = [];

    // KPI Summary
    if (kpi) {
        sections.push(`## Current KPI Summary\n${formatKpiSnapshot(kpi)}`);
    }

    // Active Signals
    if (signals.length > 0) {
        const signalLines = signals
            .sort((a, b) => {
                const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
            })
            .slice(0, 10) // Top 10 signals
            .map((s) => `- [${s.severity.toUpperCase()}] ${s.title}: ${s.description}`);
        sections.push(`## Active Signals (${signals.length} total)\n${signalLines.join('\n')}`);
    }

    // Correlated Insights
    if (correlations.length > 0) {
        const corrLines = correlations.map(
            (c) => `- **${c.title}**: ${c.narrative} (combines ${c.signalIds.length} signals)`
        );
        sections.push(`## Correlated Patterns\n${corrLines.join('\n')}`);
    }

    // Trend Drifts
    if (trends.length > 0) {
        const trendLines = trends.map((t) => `- [${t.severity.toUpperCase()}] ${t.description}`);
        sections.push(`## Gradual Trend Drifts\n${trendLines.join('\n')}`);
    }

    // Predictions
    if (predictions.length > 0) {
        const predLines = predictions
            .filter((p) => p.severity !== 'info')
            .map((p) => `- [${p.severity.toUpperCase()}] ${p.description} (confidence: ${p.confidence}%)`);
        if (predLines.length > 0) {
            sections.push(`## Predictive Warnings\n${predLines.join('\n')}`);
        }
    }

    return sections.join('\n\n');
}
