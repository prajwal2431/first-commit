import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { FulfilmentRecord } from '../models/FulfilmentRecord';

const MAX_ROWS = 10000;

const FIELD_ALIASES: Record<string, string[]> = {
  order_id: ['order_id', 'order id', 'orderid', 'order_number', 'awb'],
  sku: ['sku', 'product', 'product_id', 'item'],
  dispatch_date: ['dispatch_date', 'dispatched_at', 'shipped_date', 'ship_date', 'dispatch'],
  delivery_date: ['delivery_date', 'delivered_at', 'delivered_date', 'delivery'],
  expected_delivery_date: ['expected_delivery_date', 'edd', 'expected_date', 'promise_date', 'sla_date'],
  carrier: ['carrier', 'courier', 'logistics_partner', 'shipping_partner'],
  warehouse: ['warehouse', 'fulfillment_center', 'origin', 'ship_from'],
  region: ['region', 'zone', 'destination_city', 'delivery_city', 'city'],
  status: ['status', 'delivery_status', 'order_status', 'shipment_status'],
};

function normalize(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[\s-]+/g, '_').trim();
}

function mapHeaders(headers: string[]): Map<number, string> {
  const map = new Map<number, string>();
  const normed = headers.map(normalize);
  for (let i = 0; i < normed.length; i++) {
    for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normed[i] === normalize(a) || normed[i].includes(normalize(a)))) {
        map.set(i, canonical);
        break;
      }
    }
  }
  return map;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function mapStatus(raw: string): 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto' {
  const s = normalize(raw);
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('return') || s.includes('rto')) return 'rto';
  if (s.includes('cancel')) return 'cancelled';
  return 'dispatched';
}

export async function parseFulfilmentCsv(
  filePath: string,
  sourceId: string,
  organizationId: string
): Promise<{ inserted: number }> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records: string[][] = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const [headerRow, ...dataRows] = records;
  const colMap = mapHeaders(headerRow);

  const toInsert: Array<Record<string, unknown>> = [];
  const limited = dataRows.slice(0, MAX_ROWS);

  for (const row of limited) {
    const obj: Record<string, string> = {};
    for (let i = 0; i < row.length; i++) {
      const key = colMap.get(i);
      if (key) obj[key] = row[i];
    }

    const dispatchDate = parseDate(obj.dispatch_date ?? '');
    if (!obj.order_id || !dispatchDate) continue;

    const deliveryDate = parseDate(obj.delivery_date ?? '');
    const edd = parseDate(obj.expected_delivery_date ?? '');
    let delayDays = 0;
    if (deliveryDate && edd) {
      delayDays = Math.max(0, Math.round((deliveryDate.getTime() - edd.getTime()) / 86400000));
    }

    toInsert.push({
      sourceId,
      organizationId,
      order_id: obj.order_id,
      sku: obj.sku ?? '',
      dispatch_date: dispatchDate,
      delivery_date: deliveryDate,
      expected_delivery_date: edd,
      delay_days: delayDays,
      carrier: obj.carrier ?? '',
      warehouse: obj.warehouse ?? '',
      region: obj.region ?? '',
      status: mapStatus(obj.status ?? 'dispatched'),
    });
  }

  if (toInsert.length > 0) {
    await FulfilmentRecord.insertMany(toInsert);
  }
  return { inserted: toInsert.length };
}
