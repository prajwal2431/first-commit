import { listRetailByOrg } from '../../db/retailRecordRepo';
import { listOrdersByOrg } from '../../db/orderRepo';
import { listInventoryByOrg } from '../../db/inventoryRepo';
import { createAnomaly } from '../../db/anomalyRepo';

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
    await createAnomaly({
      organizationId,
      kpiName: a.kpiName,
      detectedAt: new Date().toISOString(),
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

  const [retailData, orderData] = await Promise.all([
    listRetailByOrg(organizationId),
    listOrdersByOrg(organizationId),
  ]);

  const dailyRevenue = new Map<string, { revenue: number; units: number }>();
  for (const r of retailData) {
    const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    const ex = dailyRevenue.get(key) ?? { revenue: 0, units: 0 };
    ex.revenue += r.revenue;
    ex.units += r.units;
    dailyRevenue.set(key, ex);
  }
  for (const o of orderData) {
    const key = typeof o.date === 'string' ? o.date.slice(0, 10) : new Date(o.date).toISOString().slice(0, 10);
    const ex = dailyRevenue.get(key) ?? { revenue: 0, units: 0 };
    ex.revenue += o.revenue;
    ex.units += o.quantity;
    dailyRevenue.set(key, ex);
  }

  const combined = dailyRevenue;
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

  const recentStart = sorted[sorted.length - 7]?.[0] ?? '';
  const skuRecent = new Map<string, number>();
  const skuPrior = new Map<string, number>();
  for (const r of retailData) {
    const dateStr = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    const week = dateStr >= recentStart ? 'recent' : 'prior';
    if (week === 'recent') {
      skuRecent.set(r.sku, (skuRecent.get(r.sku) ?? 0) + r.revenue);
    } else {
      skuPrior.set(r.sku, (skuPrior.get(r.sku) ?? 0) + r.revenue);
    }
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

  const inventoryData = await listInventoryByOrg(organizationId);
  const bySkuLoc = new Map<string, { sku: string; location: string; available_qty: number }>();
  for (const r of inventoryData) {
    const key = `${r.sku}|${r.location}`;
    if (!bySkuLoc.has(key)) {
      bySkuLoc.set(key, { sku: r.sku, location: r.location, available_qty: r.available_qty });
    }
  }
  const latestInventory = Array.from(bySkuLoc.values());

  const retailData = await listRetailByOrg(organizationId);
  const bySku = new Map<string, { sumUnits: number; totalRevenue: number; count: number }>();
  for (const r of retailData) {
    const ex = bySku.get(r.sku) ?? { sumUnits: 0, totalRevenue: 0, count: 0 };
    ex.sumUnits += r.units;
    ex.totalRevenue += r.revenue;
    ex.count += 1;
    bySku.set(r.sku, ex);
  }
  const retailDemand = Array.from(bySku.entries())
    .map(([_id, d]) => ({
      _id,
      avgUnits: d.count > 0 ? d.sumUnits / d.count : 0,
      totalRevenue: d.totalRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 50);

  const highDemandSkus = new Set(retailDemand.map((r) => r._id));

  for (const inv of latestInventory) {
    if (inv.available_qty <= 0 && highDemandSkus.has(inv.sku)) {
      const skuData = retailDemand.find((r) => r._id === inv.sku);
      anomalies.push({
        kpiName: 'stockout',
        severity: 'critical',
        currentValue: 0,
        expectedValue: skuData?.avgUnits ?? 10,
        deviationPercent: -100,
        dimensions: { sku: inv.sku, location: inv.location },
      });
    }
  }

  return anomalies;
}

async function detectConversionAnomalies(organizationId: string): Promise<DetectedAnomaly[]> {
  const anomalies: DetectedAnomaly[] = [];

  const retailData = await listRetailByOrg(organizationId);
  const dailyDataMap = new Map<string, { units: number; traffic: number; revenue: number }>();
  for (const r of retailData) {
    const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    const ex = dailyDataMap.get(key) ?? { units: 0, traffic: 0, revenue: 0 };
    ex.units += r.units;
    ex.traffic += r.traffic;
    ex.revenue += r.revenue;
    dailyDataMap.set(key, ex);
  }
  const dailyData = Array.from(dailyDataMap.entries())
    .map(([_id, d]) => ({ _id, units: d.units, traffic: d.traffic, revenue: d.revenue }))
    .sort((a, b) => a._id.localeCompare(b._id));

  if (dailyData.length < 7) return anomalies;

  const recent = dailyData.slice(-7);
  const prior = dailyData.slice(-14, -7);

  const recentTraffic = recent.reduce((s, d) => s + d.traffic, 0);
  const priorTraffic = prior.reduce((s, d) => s + d.traffic, 0);
  const recentUnits = recent.reduce((s, d) => s + d.units, 0);
  const priorUnits = prior.reduce((s, d) => s + d.units, 0);

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
