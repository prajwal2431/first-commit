import { InventoryRecord } from '../../models/InventoryRecord';
import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { LiveSignal } from '../../models/DashboardState';
import crypto from 'crypto';

interface InventoryKpis {
  oosRate: number;
  oosDelta: number;
}

export interface InventoryExposureResult {
  signals: LiveSignal[];
  kpis: InventoryKpis;
}

export async function computeInventoryExposure(organizationId: string): Promise<InventoryExposureResult> {
  const inventoryData = await InventoryRecord.find({ organizationId })
    .sort({ date: -1 })
    .lean();

  if (inventoryData.length === 0) {
    const retailInv = await RetailRecord.find({ organizationId, inventory: { $exists: true } })
      .sort({ date: -1 })
      .lean();

    if (retailInv.length === 0) {
      return { signals: [], kpis: { oosRate: 0, oosDelta: 0 } };
    }

    return computeFromRetailRecords(organizationId, retailInv);
  }

  return computeFromInventoryRecords(organizationId, inventoryData);
}

async function computeFromInventoryRecords(
  organizationId: string,
  inventoryData: any[]
): Promise<InventoryExposureResult> {
  const signals: LiveSignal[] = [];

  const latestDate = new Date(inventoryData[0].date);
  const latestDateStr = latestDate.toISOString().slice(0, 10);

  const latestInventory = inventoryData.filter(
    (r) => new Date(r.date).toISOString().slice(0, 10) === latestDateStr
  );

  const totalSkus = new Set(latestInventory.map((r: any) => r.sku)).size;
  const oosSkus = latestInventory.filter((r: any) => r.available_qty <= 0);
  const oosRate = totalSkus > 0 ? (new Set(oosSkus.map((r: any) => r.sku)).size / totalSkus) * 100 : 0;

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
        signals.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          monitorType: 'inventory',
          title: `Stockout: ${oos.sku} (${oos.location})`,
          description: `High-demand SKU ${oos.sku} is out of stock at ${oos.location}`,
          suggestedQuery: `Why is ${oos.sku} out of stock in ${oos.location}?`,
          evidenceSnippet: `SKU ${oos.sku}: 0 units at ${oos.location}, active demand detected`,
          detectedAt: new Date(),
        });
      }
    }

    if (signals.length === 0 && oosSkus.length > 0) {
      signals.push({
        id: crypto.randomUUID(),
        severity: oosRate > 10 ? 'high' : 'medium',
        monitorType: 'inventory',
        title: `${new Set(oosSkus.map((r: any) => r.sku)).size} SKUs out of stock`,
        description: `OOS rate: ${oosRate.toFixed(1)}% across ${new Set(oosSkus.map((r: any) => r.location)).size} locations`,
        suggestedQuery: 'Which SKUs are out of stock and what is the revenue impact?',
        evidenceSnippet: `${new Set(oosSkus.map((r: any) => r.sku)).size} of ${totalSkus} SKUs at zero inventory`,
        detectedAt: new Date(),
      });
    }
  }

  const locationMap = new Map<string, number>();
  for (const r of latestInventory) {
    locationMap.set(r.location, (locationMap.get(r.location) ?? 0) + r.available_qty);
  }

  const ordersByRegion = await OrderRecord.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$region', totalUnits: { $sum: '$quantity' } } },
    { $sort: { totalUnits: -1 } },
    { $limit: 5 },
  ]);

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
        detectedAt: new Date(),
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
  retailData: any[]
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
          detectedAt: new Date(),
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

async function getHighDemandSkus(organizationId: string): Promise<Set<string>> {
  const recentOrders = await OrderRecord.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$sku', totalQty: { $sum: '$quantity' }, totalRev: { $sum: '$revenue' } } },
    { $sort: { totalRev: -1 } },
    { $limit: 50 },
  ]);

  const recentRetail = await RetailRecord.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$sku', totalUnits: { $sum: '$units' }, totalRev: { $sum: '$revenue' } } },
    { $sort: { totalRev: -1 } },
    { $limit: 50 },
  ]);

  const set = new Set<string>();
  recentOrders.forEach((r: any) => set.add(r._id));
  recentRetail.forEach((r: any) => set.add(r._id));
  return set;
}
