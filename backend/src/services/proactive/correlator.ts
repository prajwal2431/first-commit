/**
 * Cross-Signal Correlator
 *
 * Groups related live signals into coherent multi-signal stories.
 * Consolidates noisy individual alerts into unified actionable narratives
 * to reduce alert fatigue.
 */

import { LiveSignal } from '../../models/DashboardState';

/* ── Public types ────────────────────────────────────────────────── */

export interface CorrelatedInsight {
    id: string;
    title: string;         // e.g. "Conversion Problem — Not a Traffic Issue"
    narrative: string;     // human-readable multi-signal explanation
    signalIds: string[];   // IDs of the grouped signals
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;      // e.g. "conversion", "supply_chain", "operations"
    suggestedRootCause: string;
}

/* ── Correlation rules ───────────────────────────────────────────── */

interface CorrelationRule {
    name: string;
    category: string;
    /** Returns true if this rule matches the given set of signals */
    matches: (signals: LiveSignal[]) => boolean;
    /** Extracts the matching signals and builds the insight */
    build: (signals: LiveSignal[]) => Omit<CorrelatedInsight, 'id'>;
}

function hasSignalLike(signals: LiveSignal[], keyword: string): LiveSignal | undefined {
    return signals.find(
        (s) =>
            s.title.toLowerCase().includes(keyword) ||
            s.description.toLowerCase().includes(keyword)
    );
}

const RULES: CorrelationRule[] = [
    // Rule 1: Traffic Up + CVR Down = Conversion problem, not traffic problem
    {
        name: 'traffic_up_cvr_down',
        category: 'conversion',
        matches: (signals) => {
            const trafficUp = hasSignalLike(signals, 'traffic') && hasSignalLike(signals, 'traffic');
            const cvrDown =
                hasSignalLike(signals, 'conversion') ||
                hasSignalLike(signals, 'cvr') ||
                (hasSignalLike(signals, 'revenue') && hasSignalLike(signals, 'traffic'));
            return !!trafficUp && !!cvrDown;
        },
        build: (signals) => {
            const related = signals.filter(
                (s) =>
                    s.title.toLowerCase().includes('traffic') ||
                    s.title.toLowerCase().includes('conversion') ||
                    s.title.toLowerCase().includes('cvr') ||
                    s.title.toLowerCase().includes('revenue')
            );
            return {
                title: 'Conversion Problem — Traffic is Fine',
                narrative:
                    'Traffic is up but revenue/conversion is declining. This indicates a conversion funnel issue, not a traffic acquisition problem. ' +
                    'Investigate product page experience, pricing, checkout friction, or inventory availability.',
                signalIds: related.map((s) => s.id),
                severity: getMaxSeverity(related),
                category: 'conversion',
                suggestedRootCause:
                    'Conversion funnel degradation despite healthy traffic inflow',
            };
        },
    },

    // Rule 2: OOS + Revenue Drop = Supply chain causing revenue loss
    {
        name: 'oos_revenue',
        category: 'supply_chain',
        matches: (signals) => {
            return !!hasSignalLike(signals, 'out-of-stock') && !!hasSignalLike(signals, 'revenue');
        },
        build: (signals) => {
            const related = signals.filter(
                (s) =>
                    s.title.toLowerCase().includes('out-of-stock') ||
                    s.title.toLowerCase().includes('oos') ||
                    s.title.toLowerCase().includes('revenue') ||
                    s.title.toLowerCase().includes('stock')
            );
            return {
                title: 'Revenue Loss Driven by Stockouts',
                narrative:
                    'Revenue is declining while out-of-stock rates are elevated. Lost sales from unavailable inventory ' +
                    'are likely the primary driver. Prioritize replenishment of high-demand SKUs.',
                signalIds: related.map((s) => s.id),
                severity: getMaxSeverity(related),
                category: 'supply_chain',
                suggestedRootCause:
                    'Inventory stockouts on key SKUs causing missed sales',
            };
        },
    },

    // Rule 3: High Returns + SLA Issues = Operations breakdown
    {
        name: 'returns_sla',
        category: 'operations',
        matches: (signals) => {
            const returns = hasSignalLike(signals, 'return') || hasSignalLike(signals, 'rto');
            const sla =
                hasSignalLike(signals, 'sla') ||
                hasSignalLike(signals, 'delay') ||
                hasSignalLike(signals, 'fulfilment');
            return !!returns && !!sla;
        },
        build: (signals) => {
            const related = signals.filter(
                (s) =>
                    s.title.toLowerCase().includes('return') ||
                    s.title.toLowerCase().includes('rto') ||
                    s.title.toLowerCase().includes('sla') ||
                    s.title.toLowerCase().includes('delay') ||
                    s.title.toLowerCase().includes('fulfilment')
            );
            return {
                title: 'Operations Breakdown — Returns & Fulfilment Issues',
                narrative:
                    'Elevated return rates combined with SLA/fulfilment issues suggest a systemic operations problem. ' +
                    'Customers may be receiving delayed or incorrect orders, driving both returns and dissatisfaction.',
                signalIds: related.map((s) => s.id),
                severity: getMaxSeverity(related),
                category: 'operations',
                suggestedRootCause:
                    'Fulfilment quality issues causing cascading returns and SLA breaches',
            };
        },
    },

    // Rule 4: Demand Spike + OOS = Missed opportunity
    {
        name: 'demand_spike_oos',
        category: 'demand',
        matches: (signals) => {
            const demand = hasSignalLike(signals, 'demand') || hasSignalLike(signals, 'spike');
            const oos = hasSignalLike(signals, 'out-of-stock') || hasSignalLike(signals, 'oos');
            return !!demand && !!oos;
        },
        build: (signals) => {
            const related = signals.filter(
                (s) =>
                    s.title.toLowerCase().includes('demand') ||
                    s.title.toLowerCase().includes('spike') ||
                    s.title.toLowerCase().includes('out-of-stock') ||
                    s.title.toLowerCase().includes('oos')
            );
            return {
                title: 'Missed Demand Opportunity — Demand Spike + Stockout',
                narrative:
                    'A demand spike is occurring while key SKUs are out of stock. This is a critical missed revenue opportunity. ' +
                    'Immediate emergency replenishment or alternative sourcing is recommended.',
                signalIds: related.map((s) => s.id),
                severity: 'critical',
                category: 'demand',
                suggestedRootCause:
                    'Demand surge coinciding with inventory gaps',
            };
        },
    },

    // Rule 5: AOV Collapse + Revenue Drop = Pricing/mix issue
    {
        name: 'aov_revenue',
        category: 'pricing',
        matches: (signals) => {
            return !!hasSignalLike(signals, 'aov') && !!hasSignalLike(signals, 'revenue');
        },
        build: (signals) => {
            const related = signals.filter(
                (s) =>
                    s.title.toLowerCase().includes('aov') ||
                    s.title.toLowerCase().includes('order value') ||
                    s.title.toLowerCase().includes('revenue')
            );
            return {
                title: 'Revenue Decline Driven by AOV Collapse',
                narrative:
                    'Average order value is declining along with total revenue, while order volume may be stable. ' +
                    'This suggests customers are buying cheaper items or fewer items per order. ' +
                    'Investigate pricing strategy, bundle offers, and product mix shift.',
                signalIds: related.map((s) => s.id),
                severity: getMaxSeverity(related),
                category: 'pricing',
                suggestedRootCause:
                    'Product mix shift toward lower-value items or discounting impact',
            };
        },
    },
];

/* ── Helpers ─────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function getMaxSeverity(signals: LiveSignal[]): 'critical' | 'high' | 'medium' | 'low' {
    let max: 'critical' | 'high' | 'medium' | 'low' = 'low';
    for (const s of signals) {
        if ((SEVERITY_ORDER[s.severity] || 0) > (SEVERITY_ORDER[max] || 0)) {
            max = s.severity;
        }
    }
    return max;
}

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Correlates the current set of live signals into grouped insights.
 * Each signal may appear in at most one correlation (first match wins).
 */
export function correlateSignals(liveSignals: LiveSignal[]): CorrelatedInsight[] {
    if (liveSignals.length < 2) return [];

    const insights: CorrelatedInsight[] = [];
    const usedSignalIds = new Set<string>();
    let counter = 0;

    for (const rule of RULES) {
        // Filter out already-used signals
        const available = liveSignals.filter((s) => !usedSignalIds.has(s.id));
        if (!rule.matches(available)) continue;

        const built = rule.build(available);
        // Only keep signals that aren't already used
        built.signalIds = built.signalIds.filter((id) => !usedSignalIds.has(id));
        if (built.signalIds.length < 2) continue;

        counter++;
        const insight: CorrelatedInsight = {
            id: `corr-${counter}-${Date.now()}`,
            ...built,
        };

        insights.push(insight);
        built.signalIds.forEach((id) => usedSignalIds.add(id));
    }

    console.log(`[correlator] ${insights.length} correlated insights from ${liveSignals.length} signals`);
    return insights;
}
