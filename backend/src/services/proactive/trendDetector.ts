/**
 * Trend-Drift Detector
 *
 * Identifies gradual metric degradation that won't trigger spike-based monitors.
 * Uses sliding-window linear regression on key metrics to detect sustained
 * negative trends before they become crises.
 */

import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { TrafficRecord } from '../../models/TrafficRecord';

/* ── Public types ────────────────────────────────────────────────── */

export interface TrendDrift {
    metric: string;         // e.g. "revenue", "aov", "oos_rate"
    direction: 'declining' | 'increasing';
    slopePerDay: number;    // absolute change per day
    slopePercent: number;   // % change per day relative to mean
    durationDays: number;   // how many consecutive days the trend has persisted
    currentValue: number;
    projectedValue7d: number; // projected value 7 days from now at current slope
    severity: 'warning' | 'critical';
    description: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

interface DataPoint {
    date: string; // YYYY-MM-DD
    value: number;
}

/**
 * Simple linear regression on an array of data points.
 * Returns { slope, intercept, r2 }.
 */
function linearRegression(points: DataPoint[]): { slope: number; intercept: number; r2: number } {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

    // Convert dates to numeric days-from-first
    const t0 = new Date(points[0].date).getTime();
    const xs = points.map((p) => (new Date(p.date).getTime() - t0) / (24 * 3600 * 1000));
    const ys = points.map((p) => p.value);

    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R² for fit quality
    const meanY = sumY / n;
    const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
}

/**
 * Check if a metric has a consistent negative (or positive bad) trend
 * over a minimum window of consecutive days.
 */
function detectDrift(
    points: DataPoint[],
    metric: string,
    badDirection: 'declining' | 'increasing',
    minDays: number = 5,
    warningSlopePercent: number = 1,  // 1% per day = warning
    criticalSlopePercent: number = 3, // 3% per day = critical
): TrendDrift | null {
    if (points.length < minDays) return null;

    // Use the last `minDays` to `points.length` window
    const window = points.slice(-Math.max(minDays, Math.min(points.length, 14)));
    const { slope, r2 } = linearRegression(window);

    // Only report if trend is consistent (R² > 0.5)
    if (r2 < 0.5) return null;

    const mean = window.reduce((a, p) => a + p.value, 0) / window.length;
    if (mean === 0) return null;

    const slopePercent = Math.abs((slope / mean) * 100);
    const isNegative = slope < 0;
    const isBad =
        (badDirection === 'declining' && isNegative) ||
        (badDirection === 'increasing' && !isNegative);

    if (!isBad || slopePercent < warningSlopePercent) return null;

    const currentValue = window[window.length - 1].value;
    const projectedValue7d = currentValue + slope * 7;
    const severity = slopePercent >= criticalSlopePercent ? 'critical' : 'warning';

    return {
        metric,
        direction: badDirection,
        slopePerDay: slope,
        slopePercent: parseFloat(slopePercent.toFixed(2)),
        durationDays: window.length,
        currentValue: parseFloat(currentValue.toFixed(2)),
        projectedValue7d: parseFloat(Math.max(0, projectedValue7d).toFixed(2)),
        severity,
        description: buildDescription(metric, badDirection, slopePercent, window.length, currentValue, projectedValue7d),
    };
}

function buildDescription(
    metric: string,
    direction: string,
    slopePercent: number,
    days: number,
    current: number,
    projected: number,
): string {
    const metricLabels: Record<string, string> = {
        revenue: 'Daily Revenue',
        aov: 'Average Order Value',
        orders: 'Order Volume',
        oos_rate: 'Out-of-Stock Rate',
        return_rate: 'Return Rate',
        traffic: 'Traffic',
    };
    const label = metricLabels[metric] || metric;
    const verb = direction === 'declining' ? 'declining' : 'rising';
    return `${label} has been ${verb} at ~${slopePercent.toFixed(1)}% per day for the last ${days} days. Current: ${current.toLocaleString('en-IN')}. Projected in 7 days: ${projected.toLocaleString('en-IN')}.`;
}

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Runs trend-drift detection across all key metrics for an organization.
 * Returns an array of detected drifts (may be empty).
 */
export async function detectTrendDrifts(organizationId: string): Promise<TrendDrift[]> {
    const drifts: TrendDrift[] = [];

    // --- Revenue & AOV from RetailRecord ---
    const retailAgg = await RetailRecord.aggregate([
        { $match: { organizationId } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                revenue: { $sum: '$revenue' },
                orders: { $sum: '$orders' },
            },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }, // last 30 days of data
    ]);

    if (retailAgg.length >= 5) {
        const revenuePoints: DataPoint[] = retailAgg.map((d: any) => ({ date: d._id, value: d.revenue }));
        const revDrift = detectDrift(revenuePoints, 'revenue', 'declining');
        if (revDrift) drifts.push(revDrift);

        const orderPoints: DataPoint[] = retailAgg.map((d: any) => ({ date: d._id, value: d.orders }));
        const orderDrift = detectDrift(orderPoints, 'orders', 'declining');
        if (orderDrift) drifts.push(orderDrift);

        const aovPoints: DataPoint[] = retailAgg.map((d: any) => ({
            date: d._id,
            value: d.orders > 0 ? d.revenue / d.orders : 0,
        }));
        const aovDrift = detectDrift(aovPoints, 'aov', 'declining');
        if (aovDrift) drifts.push(aovDrift);
    }

    // --- Traffic ---
    const trafficAgg = await TrafficRecord.aggregate([
        { $match: { organizationId } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                traffic: { $sum: '$sessions' },
            },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
    ]);

    if (trafficAgg.length >= 5) {
        const trafficPoints: DataPoint[] = trafficAgg.map((d: any) => ({ date: d._id, value: d.traffic }));
        const trafficDrift = detectDrift(trafficPoints, 'traffic', 'declining');
        if (trafficDrift) drifts.push(trafficDrift);
    }

    // --- Fulfilment: Return rate & SLA (increasing = bad) ---
    const fulfilmentAgg = await FulfilmentRecord.aggregate([
        { $match: { organizationId } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                totalOrders: { $sum: 1 },
                returns: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
    ]);

    if (fulfilmentAgg.length >= 5) {
        const returnRatePoints: DataPoint[] = fulfilmentAgg.map((d: any) => ({
            date: d._id,
            value: d.totalOrders > 0 ? (d.returns / d.totalOrders) * 100 : 0,
        }));
        const returnDrift = detectDrift(returnRatePoints, 'return_rate', 'increasing');
        if (returnDrift) drifts.push(returnDrift);
    }

    console.log(`[trendDetector] org=${organizationId}: ${drifts.length} trend drifts detected`);
    return drifts;
}
