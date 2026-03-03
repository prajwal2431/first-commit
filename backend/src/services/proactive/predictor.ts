/**
 * Predictive Forecaster
 *
 * Uses recent historical data to project key metrics forward and
 * flag gaps against baselines or inferred targets.
 * MVP: linear regression + simple seasonal adjustment.
 */

import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';

/* ── Public types ────────────────────────────────────────────────── */

export interface Prediction {
    metric: string;
    currentValue: number;
    projectedValue: number;   // projected at end of timeframe
    baselineValue: number;    // historical baseline (e.g. same period last cycle)
    gap: number;              // projected - baseline (negative = shortfall)
    gapPercent: number;       // gap as % of baseline
    confidence: number;       // 0-100 based on R²
    timeframe: string;        // e.g. "next 7 days"
    severity: 'info' | 'warning' | 'critical';
    description: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

interface DailyMetric {
    date: string;
    value: number;
}

function linearRegression(points: DailyMetric[]): { slope: number; intercept: number; r2: number } {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

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

    const meanY = sumY / n;
    const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
    const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, r2 };
}

function projectForward(points: DailyMetric[], days: number): { projected: number; confidence: number } {
    const { slope, intercept, r2 } = linearRegression(points);

    const t0 = new Date(points[0].date).getTime();
    const lastT = (new Date(points[points.length - 1].date).getTime() - t0) / (24 * 3600 * 1000);
    const futureT = lastT + days;

    return {
        projected: Math.max(0, slope * futureT + intercept),
        confidence: Math.round(Math.max(0, Math.min(100, r2 * 100))),
    };
}

function assignSeverity(gapPercent: number): 'info' | 'warning' | 'critical' {
    const absGap = Math.abs(gapPercent);
    if (absGap >= 20) return 'critical';
    if (absGap >= 10) return 'warning';
    return 'info';
}

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Generate predictions for key metrics for the next 7 days.
 * Uses the last 30 days of data for trend and the previous 30 days as baseline.
 */
export async function generatePredictions(organizationId: string): Promise<Prediction[]> {
    const predictions: Prediction[] = [];

    // --- Revenue prediction from RetailRecord ---
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
    ]);

    if (retailAgg.length >= 7) {
        // Split into recent (last 14 days) for trend and older (prior 14 days) for baseline
        const recentWindow = retailAgg.slice(-14);
        const baselineWindow = retailAgg.slice(-28, -14);

        // Revenue prediction
        const revenuePoints: DailyMetric[] = recentWindow.map((d: any) => ({ date: d._id, value: d.revenue }));
        const { projected: projRevenue, confidence: revConf } = projectForward(revenuePoints, 7);
        const currentRevenue = revenuePoints[revenuePoints.length - 1].value;
        const baselineRevenue = baselineWindow.length > 0
            ? baselineWindow.reduce((a: number, d: any) => a + d.revenue, 0) / baselineWindow.length
            : currentRevenue;
        const revGap = projRevenue - baselineRevenue;
        const revGapPct = baselineRevenue > 0 ? (revGap / baselineRevenue) * 100 : 0;

        if (Math.abs(revGapPct) >= 5) { // Only report meaningful gaps
            predictions.push({
                metric: 'revenue',
                currentValue: parseFloat(currentRevenue.toFixed(2)),
                projectedValue: parseFloat(projRevenue.toFixed(2)),
                baselineValue: parseFloat(baselineRevenue.toFixed(2)),
                gap: parseFloat(revGap.toFixed(2)),
                gapPercent: parseFloat(revGapPct.toFixed(1)),
                confidence: revConf,
                timeframe: 'next 7 days',
                severity: assignSeverity(revGapPct),
                description: revGap < 0
                    ? `Revenue is projected to be ${Math.abs(revGapPct).toFixed(1)}% below baseline over the next 7 days (₹${Math.abs(revGap).toLocaleString('en-IN')} shortfall).`
                    : `Revenue is projected to exceed baseline by ${revGapPct.toFixed(1)}% over the next 7 days.`,
            });
        }

        // AOV prediction
        const aovPoints: DailyMetric[] = recentWindow.map((d: any) => ({
            date: d._id,
            value: d.orders > 0 ? d.revenue / d.orders : 0,
        }));
        const { projected: projAov, confidence: aovConf } = projectForward(aovPoints, 7);
        const currentAov = aovPoints[aovPoints.length - 1].value;
        const baselineAov = baselineWindow.length > 0
            ? baselineWindow.reduce((a: number, d: any) => a + (d.orders > 0 ? d.revenue / d.orders : 0), 0) / baselineWindow.length
            : currentAov;
        const aovGap = projAov - baselineAov;
        const aovGapPct = baselineAov > 0 ? (aovGap / baselineAov) * 100 : 0;

        if (Math.abs(aovGapPct) >= 5) {
            predictions.push({
                metric: 'aov',
                currentValue: parseFloat(currentAov.toFixed(2)),
                projectedValue: parseFloat(projAov.toFixed(2)),
                baselineValue: parseFloat(baselineAov.toFixed(2)),
                gap: parseFloat(aovGap.toFixed(2)),
                gapPercent: parseFloat(aovGapPct.toFixed(1)),
                confidence: aovConf,
                timeframe: 'next 7 days',
                severity: assignSeverity(aovGapPct),
                description: aovGap < 0
                    ? `AOV is projected to be ${Math.abs(aovGapPct).toFixed(1)}% below baseline over the next 7 days.`
                    : `AOV is projected to exceed baseline by ${aovGapPct.toFixed(1)}% over the next 7 days.`,
            });
        }

        // Orders prediction
        const orderPoints: DailyMetric[] = recentWindow.map((d: any) => ({ date: d._id, value: d.orders }));
        const { projected: projOrders, confidence: ordConf } = projectForward(orderPoints, 7);
        const currentOrders = orderPoints[orderPoints.length - 1].value;
        const baselineOrders = baselineWindow.length > 0
            ? baselineWindow.reduce((a: number, d: any) => a + d.orders, 0) / baselineWindow.length
            : currentOrders;
        const ordGap = projOrders - baselineOrders;
        const ordGapPct = baselineOrders > 0 ? (ordGap / baselineOrders) * 100 : 0;

        if (Math.abs(ordGapPct) >= 5) {
            predictions.push({
                metric: 'orders',
                currentValue: parseFloat(currentOrders.toFixed(2)),
                projectedValue: parseFloat(projOrders.toFixed(2)),
                baselineValue: parseFloat(baselineOrders.toFixed(2)),
                gap: parseFloat(ordGap.toFixed(2)),
                gapPercent: parseFloat(ordGapPct.toFixed(1)),
                confidence: ordConf,
                timeframe: 'next 7 days',
                severity: assignSeverity(ordGapPct),
                description: ordGap < 0
                    ? `Order volume is projected to be ${Math.abs(ordGapPct).toFixed(1)}% below baseline over the next 7 days.`
                    : `Order volume is projected to exceed baseline by ${ordGapPct.toFixed(1)}% over the next 7 days.`,
            });
        }
    }

    console.log(`[predictor] org=${organizationId}: ${predictions.length} predictions generated`);
    return predictions;
}
