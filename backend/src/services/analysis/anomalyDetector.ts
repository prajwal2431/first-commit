import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { Anomaly } from '../../models/Anomaly';

export interface DetectedAnomaly {
  kpiName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  dimensions: Record<string, string>;
}

const WOW_THRESHOLD = 15;
const DOD_THRESHOLD = 10;

export async function detectAnomalies(organizationId: string): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const revenueAnomalies = await detectRevenueAnomalies(organizationId);
  anomalies.push(...revenueAnomalies);

  const stockoutAnomalies = await detectStockoutAnomalies(organizationId);
  anomalies.push(...stockoutAnomalies);

  const conversionAnomalies = await detectConversionAnomalies(organizationId);
  anomalies.push(...conversionAnomalies);

  for (const a of anomalies) {
    await Anomaly.create({
      organizationId,
      kpiName: a.kpiName,
      severity: a.severity,
      currentValue: a.currentValue,
      expectedValue: a.expectedValue,
      deviationPercent: a.deviationPercent,
      dimensions: a.dimensions,
      status: 'detected',
    });
  }

  return anomalies;
}

async function detectRevenueAnomalies(organizationId: string): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const dailyRevenue = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        revenue: { $sum: '$revenue' },
        units: { $sum: '$units' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const orderDailyRevenue = await OrderRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        revenue: { $sum: '$revenue' },
        units: { $sum: '$quantity' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const combined = new Map<string, { revenue: number; units: number }>();
  for (const d of dailyRevenue) {
    combined.set(d._id, { revenue: d.revenue, units: d.units });
  }
  for (const d of orderDailyRevenue) {
    const existing = combined.get(d._id) ?? { revenue: 0, units: 0 };
    existing.revenue += d.revenue;
    existing.units += d.units;
    combined.set(d._id, existing);
  }

  const sorted = Array.from(combined.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length < 8) return anomalies;

  const recent7 = sorted.slice(-7);
  const prior7 = sorted.slice(-14, -7);

  const recentRev = recent7.reduce((s, [, d]) => s + d.revenue, 0);
  const priorRev = prior7.reduce((s, [, d]) => s + d.revenue, 0);
  const wowDelta = priorRev > 0 ? ((recentRev - priorRev) / priorRev) * 100 : 0;

  if (wowDelta < -WOW_THRESHOLD) {
    anomalies.push({
      kpiName: 'revenue_wow',
      severity: wowDelta < -25 ? 'critical' : 'high',
      currentValue: recentRev,
      expectedValue: priorRev,
      deviationPercent: wowDelta,
      dimensions: { period: 'weekly' },
    });
  }

  if (sorted.length >= 2) {
    const lastDay = sorted[sorted.length - 1];
    const prevDay = sorted[sorted.length - 2];
    const dodDelta = prevDay[1].revenue > 0
      ? ((lastDay[1].revenue - prevDay[1].revenue) / prevDay[1].revenue) * 100
      : 0;

    if (dodDelta < -DOD_THRESHOLD) {
      anomalies.push({
        kpiName: 'revenue_dod',
        severity: dodDelta < -20 ? 'high' : 'medium',
        currentValue: lastDay[1].revenue,
        expectedValue: prevDay[1].revenue,
        deviationPercent: dodDelta,
        dimensions: { period: 'daily', date: lastDay[0] },
      });
    }
  }

  const skuRevenue = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: {
          sku: '$sku',
          week: {
            $cond: [
              { $gte: ['$date', new Date(sorted[sorted.length - 7]?.[0] ?? '')] },
              'recent',
              'prior',
            ],
          },
        },
        revenue: { $sum: '$revenue' },
      },
    },
  ]);

  const skuRecent = new Map<string, number>();
  const skuPrior = new Map<string, number>();
  for (const s of skuRevenue) {
    if (s._id.week === 'recent') skuRecent.set(s._id.sku, s.revenue);
    else skuPrior.set(s._id.sku, s.revenue);
  }

  for (const [sku, recentVal] of skuRecent) {
    const priorVal = skuPrior.get(sku) ?? 0;
    if (priorVal === 0) continue;
    const delta = ((recentVal - priorVal) / priorVal) * 100;
    if (delta < -25) {
      anomalies.push({
        kpiName: 'sku_revenue_drop',
        severity: delta < -50 ? 'critical' : 'high',
        currentValue: recentVal,
        expectedValue: priorVal,
        deviationPercent: delta,
        dimensions: { sku },
      });
    }
  }

  return anomalies;
}

async function detectStockoutAnomalies(organizationId: string): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const latestInventory = await InventoryRecord.aggregate([
    { $match: { organizationId } },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: { sku: '$sku', location: '$location' },
        available_qty: { $first: '$available_qty' },
        date: { $first: '$date' },
      },
    },
  ]);

  const retailDemand = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: '$sku',
        avgUnits: { $avg: '$units' },
        totalRevenue: { $sum: '$revenue' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 50 },
  ]);

  const highDemandSkus = new Set(retailDemand.map((r: any) => r._id));

  for (const inv of latestInventory) {
    if (inv.available_qty <= 0 && highDemandSkus.has(inv._id.sku)) {
      anomalies.push({
        kpiName: 'stockout',
        severity: 'critical',
        currentValue: 0,
        expectedValue: retailDemand.find((r: any) => r._id === inv._id.sku)?.avgUnits ?? 10,
        deviationPercent: -100,
        dimensions: { sku: inv._id.sku, location: inv._id.location },
      });
    }
  }

  return anomalies;
}

async function detectConversionAnomalies(organizationId: string): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const dailyData = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        units: { $sum: '$units' },
        traffic: { $sum: '$traffic' },
        revenue: { $sum: '$revenue' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  if (dailyData.length < 7) return anomalies;

  const recent = dailyData.slice(-7);
  const prior = dailyData.slice(-14, -7);

  const recentTraffic = recent.reduce((s: number, d: any) => s + d.traffic, 0);
  const priorTraffic = prior.reduce((s: number, d: any) => s + d.traffic, 0);
  const recentUnits = recent.reduce((s: number, d: any) => s + d.units, 0);
  const priorUnits = prior.reduce((s: number, d: any) => s + d.units, 0);

  if (recentTraffic === 0 || priorTraffic === 0) return anomalies;

  const recentCVR = (recentUnits / recentTraffic) * 100;
  const priorCVR = (priorUnits / priorTraffic) * 100;
  const cvrDelta = priorCVR > 0 ? ((recentCVR - priorCVR) / priorCVR) * 100 : 0;

  if (cvrDelta < -15) {
    anomalies.push({
      kpiName: 'conversion_rate',
      severity: cvrDelta < -30 ? 'critical' : 'high',
      currentValue: recentCVR,
      expectedValue: priorCVR,
      deviationPercent: cvrDelta,
      dimensions: { period: 'weekly' },
    });
  }

  return anomalies;
}
