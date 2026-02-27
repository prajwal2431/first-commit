/**
 * Generates realistic D2C brand sample data with deliberate anomalies.
 * Run: npx ts-node src/scripts/generateSampleData.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { RetailRecord } from '../models/RetailRecord';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';
import { FulfilmentRecord } from '../models/FulfilmentRecord';
import { TrafficRecord } from '../models/TrafficRecord';
import { DataSource } from '../models/DataSource';
import { computeAllMonitors } from '../services/monitors/computeAll';

const ORG_ID = 'default';
const SOURCE_ID = 'sample-data';

const SKUS = [
  'STITCH-TEE-OVR', 'STITCH-COORD-SET', 'MICKEY-HOODIE',
  'DISNEY-JOGGER', 'MARVEL-CAP', 'LOONEY-CROP',
  'BARBIE-DRESS', 'HP-SWEAT', 'MINIONS-SHORT', 'POOH-TOTE',
];

const REGIONS = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'];
const WAREHOUSES = ['Mumbai-HQ', 'Delhi-Hub', 'Bangalore-WH'];
const CARRIERS = ['Delhivery', 'Bluedart', 'DTDC', 'Ecom Express'];
const CHANNELS = ['Instagram', 'Meta Ads', 'Google Ads', 'Organic', 'Myntra'];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  await connectDb();
  console.log('Connected. Generating sample data...');

  await Promise.all([
    RetailRecord.deleteMany({ sourceId: SOURCE_ID }),
    OrderRecord.deleteMany({ sourceId: SOURCE_ID }),
    InventoryRecord.deleteMany({ sourceId: SOURCE_ID }),
    FulfilmentRecord.deleteMany({ sourceId: SOURCE_ID }),
    TrafficRecord.deleteMany({ sourceId: SOURCE_ID }),
  ]);

  const now = new Date();
  const days = 45;
  const startDate = new Date(now.getTime() - days * 86400000);

  const retailRecords: any[] = [];
  const orderRecords: any[] = [];
  const inventoryRecords: any[] = [];
  const fulfilmentRecords: any[] = [];
  const trafficRecords: any[] = [];

  let orderCounter = 10000;

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate.getTime() + d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const isAnomalyPeriod = d >= 35 && d <= 40;
    const isSpikeDay = d === 30 || d === 31;

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
        organizationId: ORG_ID,
        date,
        sku,
        revenue: baseRevenue,
        units: baseUnits,
        traffic: baseTraffic,
        inventory: baseInventory,
        returns,
      });

      const numOrders = Math.max(1, Math.round(baseUnits / rand(1, 3)));
      for (let o = 0; o < numOrders; o++) {
        const region = pick(REGIONS);
        const qty = Math.max(1, Math.round(baseUnits / numOrders));
        orderRecords.push({
          sourceId: SOURCE_ID,
          organizationId: ORG_ID,
          order_id: `ORD-${++orderCounter}`,
          sku,
          quantity: qty,
          revenue: qty * rand(400, 1200),
          date,
          region,
        });
      }

      for (const wh of WAREHOUSES) {
        let invQty = Math.round(baseInventory / WAREHOUSES.length);
        if (isAnomalyPeriod && (sku === 'STITCH-TEE-OVR' || sku === 'STITCH-COORD-SET')) {
          invQty = wh === 'Mumbai-HQ' ? rand(800, 1200) : 0;
        }
        inventoryRecords.push({
          sourceId: SOURCE_ID,
          organizationId: ORG_ID,
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
        organizationId: ORG_ID,
        date,
        channel,
        sku: '',
        sessions,
        impressions,
        clicks,
        spend,
      });
    }

    const ordersForDay = orderRecords.filter(
      (o) => new Date(o.date).toISOString().slice(0, 10) === dateStr
    );
    for (const order of ordersForDay.slice(0, Math.min(ordersForDay.length, 20))) {
      const dispatchDate = new Date(date.getTime() + rand(0, 2) * 86400000);
      const edd = new Date(dispatchDate.getTime() + rand(3, 5) * 86400000);
      const actualDeliveryOffset = rand(2, 7);
      const deliveryDate = new Date(dispatchDate.getTime() + actualDeliveryOffset * 86400000);

      let status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto' = 'delivered';
      if (Math.random() < 0.03) status = 'cancelled';
      else if (Math.random() < 0.05) status = 'rto';
      else if (deliveryDate > now) status = 'dispatched';

      const isDelayedRegion = isAnomalyPeriod && order.region === 'Delhi';

      fulfilmentRecords.push({
        sourceId: SOURCE_ID,
        organizationId: ORG_ID,
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

  console.log(`Inserting: ${retailRecords.length} retail, ${orderRecords.length} orders, ${inventoryRecords.length} inventory, ${fulfilmentRecords.length} fulfilment, ${trafficRecords.length} traffic`);

  await Promise.all([
    RetailRecord.insertMany(retailRecords),
    OrderRecord.insertMany(orderRecords),
    InventoryRecord.insertMany(inventoryRecords),
    FulfilmentRecord.insertMany(fulfilmentRecords),
    TrafficRecord.insertMany(trafficRecords),
  ]);

  await DataSource.findOneAndUpdate(
    { fileName: 'sample-data-generator', organizationId: ORG_ID },
    {
      userId: 'system',
      organizationId: ORG_ID,
      fileName: 'sample-data-generator',
      fileType: 'csv',
      status: 'completed',
      recordCount: retailRecords.length + orderRecords.length + inventoryRecords.length,
      uploadedAt: new Date(),
    },
    { upsert: true }
  );

  console.log('Computing monitors...');
  await computeAllMonitors(ORG_ID);

  console.log('Done! Sample data generated successfully.');
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error generating sample data:', err);
  process.exit(1);
});
