/**
 * Generates the same sample data as generateSampleData.ts but writes to XLSX.
 * Same schema and logic; no DB. Run: npx ts-node src/scripts/generateSampleDataToXlsx.ts
 * Output: sample-data.xlsx in backend folder (or path from OUT_XLSX env).
 */
import * as XLSX from 'xlsx';
import * as path from 'path';

const ORG_ID = process.env.TENANT_ID ?? 'prajwal-mind';
const SOURCE_ID = 'sample-data';
const OUT_PATH = process.env.OUT_XLSX ?? path.join(process.cwd(), 'sample-data.xlsx');

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

function toRow(obj: Record<string, unknown>): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) row[k] = v.toISOString().slice(0, 10);
    else if (v !== undefined && v !== null) row[k] = v as string | number;
  }
  return row;
}

function main() {
  console.log('Generating sample data (same schema as generateSampleData.ts)...');

  const now = new Date();
  const days = 45;
  const startDate = new Date(now.getTime() - days * 86400000);

  const retailRecords: Record<string, unknown>[] = [];
  const orderRecords: Record<string, unknown>[] = [];
  const inventoryRecords: Record<string, unknown>[] = [];
  const fulfilmentRecords: Record<string, unknown>[] = [];
  const trafficRecords: Record<string, unknown>[] = [];

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
      (o) => new Date((o.date as Date).getTime()).toISOString().slice(0, 10) === dateStr
    );
    for (const order of ordersForDay.slice(0, Math.min(ordersForDay.length, 20))) {
      const ord = order as { date: Date; order_id: string; sku: string; region: string };
      const dispatchDate = new Date(ord.date.getTime() + rand(0, 2) * 86400000);
      const edd = new Date(dispatchDate.getTime() + rand(3, 5) * 86400000);
      const actualDeliveryOffset = rand(2, 7);
      const deliveryDate = new Date(dispatchDate.getTime() + actualDeliveryOffset * 86400000);

      let status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto' = 'delivered';
      if (Math.random() < 0.03) status = 'cancelled';
      else if (Math.random() < 0.05) status = 'rto';
      else if (deliveryDate > now) status = 'dispatched';

      const isDelayedRegion = isAnomalyPeriod && ord.region === 'Delhi';

      fulfilmentRecords.push({
        sourceId: SOURCE_ID,
        organizationId: ORG_ID,
        order_id: ord.order_id,
        sku: ord.sku,
        dispatch_date: dispatchDate,
        delivery_date: status === 'delivered' || status === 'rto' ? deliveryDate : undefined,
        expected_delivery_date: edd,
        delay_days: isDelayedRegion ? rand(2, 5) : Math.max(0, actualDeliveryOffset - 5),
        carrier: pick(CARRIERS),
        warehouse: pick(WAREHOUSES),
        region: ord.region,
        status,
      });
    }
  }

  console.log(`Generated: ${retailRecords.length} retail, ${orderRecords.length} orders, ${inventoryRecords.length} inventory, ${fulfilmentRecords.length} fulfilment, ${trafficRecords.length} traffic`);

  const wb = XLSX.utils.book_new();

  wb.SheetNames.push('Retail');
  wb.Sheets['Retail'] = XLSX.utils.json_to_sheet(retailRecords.map(toRow));

  wb.SheetNames.push('Orders');
  wb.Sheets['Orders'] = XLSX.utils.json_to_sheet(orderRecords.map(toRow));

  wb.SheetNames.push('Inventory');
  wb.Sheets['Inventory'] = XLSX.utils.json_to_sheet(inventoryRecords.map(toRow));

  wb.SheetNames.push('Fulfilment');
  wb.Sheets['Fulfilment'] = XLSX.utils.json_to_sheet(fulfilmentRecords.map(toRow));

  wb.SheetNames.push('Traffic');
  wb.Sheets['Traffic'] = XLSX.utils.json_to_sheet(trafficRecords.map(toRow));

  XLSX.writeFile(wb, OUT_PATH);
  console.log(`Done. Written to ${OUT_PATH}`);
}

main();
