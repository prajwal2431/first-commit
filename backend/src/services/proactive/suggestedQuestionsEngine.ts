/**
 * Suggested Questions Engine
 *
 * Generates contextual, actionable "things you should be asking about"
 * based on the current state of signals, trends, and predictions.
 * These are surfaced on the dashboard to drive proactive engagement.
 */

import { LiveSignal } from '../../models/DashboardState';
import { TrendDrift } from './trendDetector';
import { CorrelatedInsight } from './correlator';
import { Prediction } from './predictor';

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Generate 3–5 contextual suggested questions based on the current proactive context.
 */
export function generateSuggestedQuestions(
    signals: LiveSignal[],
    trends: TrendDrift[],
    correlations: CorrelatedInsight[],
    predictions: Prediction[],
): string[] {
    const questions: string[] = [];

    // From correlated insights — these are the most actionable
    for (const corr of correlations.slice(0, 2)) {
        switch (corr.category) {
            case 'conversion':
                questions.push('Why is conversion declining even though traffic is healthy?');
                break;
            case 'supply_chain':
                questions.push('Which SKUs are out of stock and how much revenue are we losing?');
                break;
            case 'operations':
                questions.push('What is driving the increase in returns and fulfilment SLA breaches?');
                break;
            case 'demand':
                questions.push('Can we fast-track replenishment for the SKUs seeing demand spikes?');
                break;
            case 'pricing':
                questions.push('Why is the average order value declining — is there a product mix shift?');
                break;
        }
    }

    // From trend drifts — highlight slow leaks
    for (const trend of trends.slice(0, 2)) {
        if (questions.length >= 5) break;
        switch (trend.metric) {
            case 'revenue':
                questions.push(`Why has daily revenue been declining for ${trend.durationDays} days straight?`);
                break;
            case 'aov':
                questions.push(`What's causing the AOV to gradually drop over the last ${trend.durationDays} days?`);
                break;
            case 'orders':
                questions.push(`Why is order volume trending down? Is it traffic, conversion, or both?`);
                break;
            case 'return_rate':
                questions.push(`Returns are creeping up over ${trend.durationDays} days — what's causing this?`);
                break;
            case 'traffic':
                questions.push(`Traffic has been declining for ${trend.durationDays} days — is this a channel issue?`);
                break;
        }
    }

    // From predictions — forward-looking
    for (const pred of predictions.filter((p) => p.severity !== 'info').slice(0, 2)) {
        if (questions.length >= 5) break;
        if (pred.gap < 0) {
            questions.push(
                `${capitalize(pred.metric)} is projected to miss baseline by ${Math.abs(pred.gapPercent).toFixed(0)}% — what should we do?`
            );
        }
    }

    // From critical signals — if we still need more
    if (questions.length < 3) {
        const criticalSignals = signals.filter((s) => s.severity === 'critical' || s.severity === 'high');
        for (const sig of criticalSignals.slice(0, 3)) {
            if (questions.length >= 5) break;
            if (sig.suggestedQuery) {
                questions.push(sig.suggestedQuery);
            } else {
                questions.push(`Why is "${sig.title}" happening and what should we do about it?`);
            }
        }
    }

    // Deduplicate and limit
    const unique = [...new Set(questions)];
    return unique.slice(0, 5);
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
