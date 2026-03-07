import { listInventoryByOrg } from '../../db/inventoryRepo';
import { listRetailByOrg } from '../../db/retailRecordRepo';
import { listOrdersByOrg } from '../../db/orderRepo';
import type { LiveSignal } from '../../models/DashboardState';
import type { SignalThresholds } from '../../models/OrgSettings';
import crypto from 'crypto';

interface InventoryKpis {
  oosRate: number;
  oosDelta: number;
}

export interface InventoryExposureResult {
  signals: LiveSignal[];
  kpis: InventoryKpis;
}

export async function computeInventoryExposure(
  organizationId: string,
  thresholds: SignalThresholds
): Promise<InventoryExposureResult> {
  const inventoryData = await listInventoryByOrg(organizationId);

  if (inventoryData.length === 0) {
    const retailInv = await listRetailByOrg(organizationId);
    const withInventory = retailInv.filter((r) => r.inventory != null);
    if (withInventory.length === 0) {
      return { signals: [], kpis: { oosRate: 0, oosDelta: 0 } };
    }
    return computeFromRetailRecords(organizationId, withInventory, thresholds);
  }

  return computeFromInventoryRecords(organizationId, inventoryData, thresholds);
}

async function computeFromInventoryRecords(
  organizationId: string,
  inventoryData: any[],
  thresholds: SignalThresholds
): Promise<InventoryExposureResult> {
  const signals: LiveSignal[] = [];

  const latestDateStr = typeof inventoryData[0].date === 'string'
    ? inventoryData[0].date.slice(0, 10)
    : new Date(inventoryData[0].date).toISOString().slice(0, 10);

  const latestInventory = inventoryData.filter((r) => {
    const d = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    return d === latestDateStr;
  });

  const totalSkus = new Set(latestInventory.map((r: any) => r.sku)).size;
  const oosSkus = latestInventory.filter((r: any) => r.available_qty <= 0);
  const oosRate = totalSkus > 0 ? (new Set(oosSkus.map((r: any) => r.sku)).size / totalSkus) * 100 : 0;

  const latestDate = new Date(latestDateStr);
  const weekAgo = new Date(latestDate.getTime() - 7 * 86400000);
  const priorInventory = inventoryData.filter((r) => {
    const d = new Date(r.date);
    return d >= weekAgo && d.toISOString().slice(0, 10) !== latestDateStr;
  });
  const priorOosSkus = priorInventory.filter((r: any) => r.available_qty <= 0);
  const priorTotalSkus = new Set(priorInventory.map((r: any) => r.sku)).size;
  const priorOosRate = priorTotalSkus > 0
    ? (new Set(priorOosSkus.map((r: any) => r.sku)).size / priorTotalSkus) * 100
    : 0;

  if (oosSkus.length > 0) {
    const demandSkus = await getHighDemandSkus(organizationId);

    for (const oos of oosSkus) {
      if (demandSkus.has(oos.sku)) {
        const demandInfo = demandSkus.get(oos.sku);
        signals.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          monitorType: 'inventory',
          title: `Stockout: ${oos.sku} (${oos.location})`,
          description: `High-demand SKU ${oos.sku} is out of stock at ${oos.location}`,
          suggestedQuery: `Why is ${oos.sku} out of stock in ${oos.location}?`,
          evidenceSnippet: `SKU ${oos.sku}: 0 units at ${oos.location}, active demand detected`,
          detectedAt: new Date().toISOString(),
          impact: {
            revenueAtRisk: demandInfo?.estimatedDailyRev ? Math.round(demandInfo.estimatedDailyRev * 7) : undefined,
            unitsAtRisk: demandInfo?.totalQty,
            confidence: 85,
            drivers: [
              { driver: `OOS at ${oos.location}`, contribution: 70 },
              { driver: 'Demand exceeds supply', contribution: 30 },
            ],
          },
        });
      }
    }

    // Use threshold for severity determination
    if (signals.length === 0 && oosSkus.length > 0) {
      const severity = oosRate > thresholds.oosRateCritical ? 'critical'
        : oosRate > thresholds.oosRateWarning ? 'high'
          : 'medium';
      signals.push({
        id: crypto.randomUUID(),
        severity,
        monitorType: 'inventory',
        title: `${new Set(oosSkus.map((r: any) => r.sku)).size} SKUs out of stock`,
        description: `OOS rate: ${oosRate.toFixed(1)}% across ${new Set(oosSkus.map((r: any) => r.location)).size} locations`,
        suggestedQuery: 'Which SKUs are out of stock and what is the revenue impact?',
        evidenceSnippet: `${new Set(oosSkus.map((r: any) => r.sku)).size} of ${totalSkus} SKUs at zero inventory`,
        detectedAt: new Date().toISOString(),
        impact: {
          confidence: 75,
          drivers: [
            { driver: 'Multiple SKUs at zero stock', contribution: 80 },
            { driver: 'Replenishment lag', contribution: 20 },
          ],
        },
      });
    }
  }

  // Demand-inventory mismatch detection
  const locationMap = new Map<string, number>();
  for (const r of latestInventory) {
    locationMap.set(r.location, (locationMap.get(r.location) ?? 0) + r.available_qty);
  }

  const orderData = await listOrdersByOrg(organizationId);
  const regionMap = new Map<string, { totalUnits: number; totalRev: number }>();
  for (const o of orderData) {
    const key = o.region || 'Unknown';
    const ex = regionMap.get(key) ?? { totalUnits: 0, totalRev: 0 };
    ex.totalUnits += o.quantity;
    ex.totalRev += o.revenue;
    regionMap.set(key, ex);
  }
  const ordersByRegion = Array.from(regionMap.entries())
    .map(([_id, d]) => ({ _id, totalUnits: d.totalUnits, totalRev: d.totalRev }))
    .sort((a, b) => b.totalUnits - a.totalUnits)
    .slice(0, 5);

  for (const region of ordersByRegion) {
    const locationStock = locationMap.get(region._id) ?? 0;
    if (locationStock === 0 && region.totalUnits > 0) {
      signals.push({
        id: crypto.randomUUID(),
        severity: 'high',
        monitorType: 'inventory',
        title: `Demand-inventory mismatch: ${region._id}`,
        description: `High demand in ${region._id} but zero inventory at that location`,
        suggestedQuery: `Should we transfer inventory to ${region._id}?`,
        evidenceSnippet: `${region.totalUnits} units ordered from ${region._id} but 0 units stocked there`,
        detectedAt: new Date().toISOString(),
        impact: {
          revenueAtRisk: Math.round(region.totalRev * 0.4),
          unitsAtRisk: region.totalUnits,
          confidence: 80,
          drivers: [
            { driver: `Stock absent at ${region._id}`, contribution: 60 },
            { driver: 'Distribution imbalance', contribution: 40 },
          ],
        },
      });
    }
  }

  return {
    signals,
    kpis: {
      oosRate: Math.round(oosRate * 10) / 10,
      oosDelta: Math.round((oosRate - priorOosRate) * 10) / 10,
    },
  };
}

async function computeFromRetailRecords(
  organizationId: string,
  retailData: any[],
  thresholds: SignalThresholds
): Promise<InventoryExposureResult> {
  const signals: LiveSignal[] = [];

  const latestDate = new Date(retailData[0].date).toISOString().slice(0, 10);
  const latestRecords = retailData.filter(
    (r) => new Date(r.date).toISOString().slice(0, 10) === latestDate
  );

  const totalSkus = new Set(latestRecords.map((r: any) => r.sku)).size;
  const oosRecords = latestRecords.filter((r: any) => r.inventory <= 0);
  const oosSkuCount = new Set(oosRecords.map((r: any) => r.sku)).size;
  const oosRate = totalSkus > 0 ? (oosSkuCount / totalSkus) * 100 : 0;

  if (oosSkuCount > 0) {
    for (const oos of oosRecords.slice(0, 3)) {
      if (oos.units > 0 || oos.traffic > 0) {
        signals.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          monitorType: 'inventory',
          title: `Stockout: ${oos.sku}`,
          description: `SKU ${oos.sku} at 0 inventory with active demand (${oos.units} units sold recently)`,
          suggestedQuery: `What is the revenue impact of ${oos.sku} being out of stock?`,
          evidenceSnippet: `${oos.sku}: 0 inventory, ${oos.units} units in demand`,
          detectedAt: new Date().toISOString(),
          impact: {
            revenueAtRisk: Math.round(oos.revenue * 3),
            unitsAtRisk: oos.units * 3,
            confidence: 70,
            drivers: [
              { driver: `${oos.sku} stockout`, contribution: 80 },
              { driver: 'Demand continues during OOS', contribution: 20 },
            ],
          },
        });
      }
    }
  }

  return {
    signals,
    kpis: {
      oosRate: Math.round(oosRate * 10) / 10,
      oosDelta: 0,
    },
  };
}

async function getHighDemandSkus(
  organizationId: string
): Promise<Map<string, { totalQty: number; estimatedDailyRev: number }>> {
  const [orderData, retailData] = await Promise.all([
    listOrdersByOrg(organizationId),
    listRetailByOrg(organizationId),
  ]);

  const map = new Map<string, { totalQty: number; estimatedDailyRev: number }>();
  for (const o of orderData) {
    const ex = map.get(o.sku) ?? { totalQty: 0, estimatedDailyRev: 0 };
    ex.totalQty += o.quantity;
    ex.estimatedDailyRev += o.revenue / 14;
    map.set(o.sku, ex);
  }
  for (const r of retailData) {
    const ex = map.get(r.sku) ?? { totalQty: 0, estimatedDailyRev: 0 };
    ex.totalQty += r.units;
    ex.estimatedDailyRev += r.revenue / 14;
    map.set(r.sku, ex);
  }
  // Sort by estimatedDailyRev and keep top 50
  const sorted = Array.from(map.entries())
    .sort((a, b) => b[1].estimatedDailyRev - a[1].estimatedDailyRev)
    .slice(0, 50);
  return new Map(sorted);
}
