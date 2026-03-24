/**
 * Generates ~6 months of D2C sample data (sales + traffic) with end-window anomalies
 * so WoW monitors fire. Writes CSVs for Sources upload and/or inserts into MongoDB.
 *
 * Run (DB + CSV):  npx ts-node --transpile-only src/scripts/generateSampleData.ts
 * CSV files only:  npx ts-node --transpile-only src/scripts/generateSampleData.ts --csv-only
 *
 * DB seed: uses TENANT_ID if set; otherwise seeds every registered tenant (so your login sees data).
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import fs from 'fs';
import { connectDb, disconnectDb } from '../config/db';
import { Tenant } from '../models/Tenant';
import { RetailRecord } from '../models/RetailRecord';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';
import { FulfilmentRecord } from '../models/FulfilmentRecord';
import { TrafficRecord } from '../models/TrafficRecord';
import { DataSource } from '../models/DataSource';
import { computeAllMonitors } from '../services/monitors/computeAll';

const SOURCE_ID = 'sample-data';
const CSV_ONLY = process.argv.includes('--csv-only');
/** ~6 months of daily grain */
const DAYS = 186;

const SKUS = [
  'STITCH-TEE-OVR',
  'STITCH-COORD-SET',
  'MICKEY-HOODIE',
  'DISNEY-JOGGER',
  'MARVEL-CAP',
  'LOONEY-CROP',
  'BARBIE-DRESS',
  'HP-SWEAT',
  'MINIONS-SHORT',
  'POOH-TOTE',
];

const REGIONS = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'];
const WAREHOUSES = ['Mumbai-HQ', 'Delhi-Hub', 'Bangalore-WH'];
const CARRIERS = ['Delhivery', 'Bluedart', 'DTDC', 'Ecom Express'];
const CHANNELS = ['Instagram', 'Meta Ads', 'Google Ads', 'Organic', 'Myntra'];

function mulberry32(seed: number) {
  return function raw() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20250324);

function rand(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function csvEscape(cell: string | number): string {
  const s = String(cell);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeRetailCsv(rows: any[], outPath: string): void {
  const lines = ['date,sku,revenue,units,traffic,inventory,returns'];
  for (const r of rows) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    lines.push(
      [d, r.sku, r.revenue, r.units, r.traffic, r.inventory, r.returns].map(csvEscape).join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
}

function writeTrafficCsv(rows: any[], outPath: string): void {
  const lines = ['date,channel,sessions,impressions,clicks,spend'];
  for (const r of rows) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    lines.push(
      [d, r.channel, r.sessions, r.impressions, r.clicks, r.spend].map(csvEscape).join(',')
    );
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
}

function buildDataset(now: Date, organizationId: string) {
  const startDate = new Date(now.getTime() - DAYS * 86400000);

  const retailRecords: any[] = [];
  const orderRecords: any[] = [];
  const inventoryRecords: any[] = [];
  const fulfilmentRecords: any[] = [];
  const trafficRecords: any[] = [];

  let orderCounter = 10000;

  for (let d = 0; d < DAYS; d++) {
    const date = new Date(startDate.getTime() + d * 86400000);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const isAnomalyPeriod = d >= DAYS - 7;
    const isSpikeDay = d === DAYS - 5 || d === DAYS - 6;

    const ordersThisDay: any[] = [];

    for (const sku of SKUS) {
      let baseUnits = rand(5, 30);
      let baseRevenue = baseUnits * rand(400, 1200);
      let baseTraffic = rand(50, 300);
      let baseInventory = rand(100, 500);

      if (isWeekend) {
        baseUnits = Math.round(baseUnits * 1.3);
        baseTraffic = Math.round(baseTraffic * 1.4);
      }

      if (isAnomalyPeriod && (sku === 'STITCH-TEE-OVR' || sku === 'STITCH-COORD-SET')) {
        baseInventory = 0;
        baseUnits = Math.round(baseUnits * 0.1);
        baseRevenue = baseUnits * rand(400, 600);
        baseTraffic = Math.round(baseTraffic * 3);
      }

      if (isSpikeDay && sku === 'STITCH-TEE-OVR') {
        baseUnits = Math.round(baseUnits * 4);
        baseTraffic = Math.round(baseTraffic * 5);
        baseRevenue = baseUnits * rand(600, 900);
      }

      const returns = Math.round(baseUnits * (rand(2, 8) / 100));

      retailRecords.push({
        sourceId: SOURCE_ID,
        organizationId,
        date,
        sku,
        revenue: baseRevenue,
        units: baseUnits,
        traffic: baseTraffic,
        inventory: baseInventory,
        returns,
      });

      const numOrders = Math.min(3, Math.max(1, Math.round(baseUnits / rand(1, 3))));
      for (let o = 0; o < numOrders; o++) {
        const region = pick(REGIONS);
        const qty = Math.max(1, Math.round(baseUnits / numOrders));
        const ord = {
          sourceId: SOURCE_ID,
          organizationId,
          order_id: `ORD-${++orderCounter}`,
          sku,
          quantity: qty,
          revenue: qty * rand(400, 1200),
          date,
          region,
        };
        orderRecords.push(ord);
        ordersThisDay.push(ord);
      }

      for (const wh of WAREHOUSES) {
        let invQty = Math.round(baseInventory / WAREHOUSES.length);
        if (isAnomalyPeriod && (sku === 'STITCH-TEE-OVR' || sku === 'STITCH-COORD-SET')) {
          invQty = wh === 'Mumbai-HQ' ? rand(800, 1200) : 0;
        }
        inventoryRecords.push({
          sourceId: SOURCE_ID,
          organizationId,
          sku,
          location: wh,
          available_qty: invQty,
          date,
        });
      }
    }

    for (const channel of CHANNELS) {
      let sessions = rand(200, 2000);
      let impressions = sessions * rand(3, 8);
      let clicks = Math.round(sessions * (rand(5, 20) / 100));
      let spend = channel.includes('Ads') ? rand(500, 5000) : 0;

      if (isAnomalyPeriod && channel === 'Instagram') {
        sessions *= 5;
        impressions *= 4;
        clicks *= 3;
      }

      trafficRecords.push({
        sourceId: SOURCE_ID,
        organizationId,
        date,
        channel,
        sku: '',
        sessions,
        impressions,
        clicks,
        spend,
      });
    }

    for (const order of ordersThisDay.slice(0, Math.min(ordersThisDay.length, 20))) {
      const dispatchDate = new Date(date.getTime() + rand(0, 2) * 86400000);
      const edd = new Date(dispatchDate.getTime() + rand(3, 5) * 86400000);
      const actualDeliveryOffset = rand(2, 7);
      const deliveryDate = new Date(dispatchDate.getTime() + actualDeliveryOffset * 86400000);

      let status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto' = 'delivered';
      if (rng() < 0.03) status = 'cancelled';
      else if (rng() < 0.05) status = 'rto';
      else if (deliveryDate > now) status = 'dispatched';

      const isDelayedRegion = isAnomalyPeriod && order.region === 'Delhi';

      fulfilmentRecords.push({
        sourceId: SOURCE_ID,
        organizationId,
        order_id: order.order_id,
        sku: order.sku,
        dispatch_date: dispatchDate,
        delivery_date: status === 'delivered' || status === 'rto' ? deliveryDate : undefined,
        expected_delivery_date: edd,
        delay_days: isDelayedRegion ? rand(2, 5) : Math.max(0, actualDeliveryOffset - 5),
        carrier: pick(CARRIERS),
        warehouse: pick(WAREHOUSES),
        region: order.region,
        status,
      });
    }
  }

  return {
    retailRecords,
    orderRecords,
    inventoryRecords,
    fulfilmentRecords,
    trafficRecords,
  };
}

function remapOrg<T extends { organizationId: string }>(rows: T[], organizationId: string): T[] {
  return rows.map((r) => ({ ...r, organizationId }));
}

async function resolveOrgIds(): Promise<string[]> {
  const explicit = process.env.TENANT_ID?.trim();
  if (explicit) return [explicit];
  const ids = (await Tenant.distinct('tenantId')) as string[];
  return ids.length > 0 ? [...ids].sort() : ['default'];
}

async function main() {
  const now = new Date();

  if (CSV_ONLY) {
    const template = buildDataset(now, 'default');
    const sampleDir = path.join(process.cwd(), 'sample-data');
    if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });
    const retailCsvPath = path.join(sampleDir, 'sample-retail-sales-6mo.csv');
    const trafficCsvPath = path.join(sampleDir, 'sample-traffic-6mo.csv');
    writeRetailCsv(template.retailRecords, retailCsvPath);
    writeTrafficCsv(template.trafficRecords, trafficCsvPath);
    console.log(`Wrote ${retailCsvPath}`);
    console.log(`Wrote ${trafficCsvPath}`);
    console.log(
      'CSV-only mode: upload via Sources — Sales: auto; Marketing & Traffic: traffic.'
    );
    process.exit(0);
  }

  await connectDb();
  const orgIds = await resolveOrgIds();
  console.log(`Seeding organizations: ${orgIds.join(', ')}`);

  const template = buildDataset(now, orgIds[0]);

  const sampleDir = path.join(process.cwd(), 'sample-data');
  if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });
  writeRetailCsv(template.retailRecords, path.join(sampleDir, 'sample-retail-sales-6mo.csv'));
  writeTrafficCsv(template.trafficRecords, path.join(sampleDir, 'sample-traffic-6mo.csv'));
  console.log(`Updated ${path.join(sampleDir, 'sample-retail-sales-6mo.csv')}`);

  for (const orgId of orgIds) {
    const retailRecords = remapOrg(template.retailRecords, orgId);
    const orderRecords = remapOrg(template.orderRecords, orgId);
    const inventoryRecords = remapOrg(template.inventoryRecords, orgId);
    const fulfilmentRecords = remapOrg(template.fulfilmentRecords, orgId);
    const trafficRecords = remapOrg(template.trafficRecords, orgId);

    console.log(`[${orgId}] Clearing prior sample-data rows...`);
    await Promise.all([
      RetailRecord.deleteMany({ sourceId: SOURCE_ID, organizationId: orgId }),
      OrderRecord.deleteMany({ sourceId: SOURCE_ID, organizationId: orgId }),
      InventoryRecord.deleteMany({ sourceId: SOURCE_ID, organizationId: orgId }),
      FulfilmentRecord.deleteMany({ sourceId: SOURCE_ID, organizationId: orgId }),
      TrafficRecord.deleteMany({ sourceId: SOURCE_ID, organizationId: orgId }),
    ]);

    console.log(
      `[${orgId}] Inserting: ${retailRecords.length} retail, ${orderRecords.length} orders, ${inventoryRecords.length} inventory, ${fulfilmentRecords.length} fulfilment, ${trafficRecords.length} traffic`
    );

    await Promise.all([
      RetailRecord.insertMany(retailRecords),
      OrderRecord.insertMany(orderRecords),
      InventoryRecord.insertMany(inventoryRecords),
      FulfilmentRecord.insertMany(fulfilmentRecords),
      TrafficRecord.insertMany(trafficRecords),
    ]);

    await DataSource.findOneAndUpdate(
      { fileName: 'sample-data-generator', organizationId: orgId },
      {
        userId: 'system',
        organizationId: orgId,
        fileName: 'sample-data-generator',
        fileType: 'csv',
        status: 'completed',
        recordCount: retailRecords.length + orderRecords.length + inventoryRecords.length,
        uploadedAt: new Date(),
      },
      { upsert: true }
    );

    console.log(`[${orgId}] Computing monitors...`);
    await computeAllMonitors(orgId);
  }

  console.log('Done. Refresh the app; dashboard and chat should show KPIs and signals.');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error generating sample data:', err);
  process.exit(1);
});
