import * as XLSX from 'xlsx';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';

const MAX_ROWS = 10000; // prototype limit

function normalizeKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .trim();
}

function findColumn(row: Record<string, unknown>, ...candidates: string[]): string | null {
  const keys = Object.keys(row).map(normalizeKey);
  for (const c of candidates) {
    const n = normalizeKey(c);
    const found = keys.find((k) => k === n || k.includes(n) || n.includes(k));
    if (found) {
      const orig = Object.keys(row).find((k) => normalizeKey(k) === found);
      return orig ?? null;
    }
  }
  return null;
}

function isOrdersSheet(row: Record<string, unknown>): boolean {
  const hasOrderId = findColumn(row, 'order_id', 'order id', 'orderid');
  const hasRevenue = findColumn(row, 'revenue', 'amount', 'sales');
  const hasSku = findColumn(row, 'sku', 'product', 'item');
  return !!(hasOrderId && (hasRevenue || hasSku));
}

function isInventorySheet(row: Record<string, unknown>): boolean {
  const hasSku = findColumn(row, 'sku', 'product', 'item');
  const hasQty = findColumn(row, 'available_qty', 'available qty', 'quantity', 'qty', 'stock');
  const hasLocation = findColumn(row, 'location', 'warehouse', 'store');
  return !!(hasSku && (hasQty || hasLocation));
}

function getVal(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const col = findColumn(row, ...candidates);
  return col ? row[col] : undefined;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
}

export type ParseResult = { dataType: 'orders' | 'inventory'; recordCount: number };

export async function parseExcelFile(
  filePath: string,
  sourceId: string,
  organizationId: string
): Promise<ParseResult> {
  const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheet found');
  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) throw new Error('Sheet is empty');

  const first = rows[0] as Record<string, unknown>;
  if (isOrdersSheet(first)) {
    const orderIdCol = findColumn(first, 'order_id', 'order id', 'orderid');
    const skuCol = findColumn(first, 'sku', 'product', 'item');
    if (!orderIdCol || !skuCol) throw new Error('Orders sheet must have order_id and sku columns');

    const toInsert: Array<{
      sourceId: string;
      organizationId: string;
      order_id: string;
      sku: string;
      quantity: number;
      revenue: number;
      date: Date;
      region: string;
    }> = [];
    const limited = rows.slice(0, MAX_ROWS);
    for (const row of limited) {
      const r = row as Record<string, unknown>;
      const order_id = String(getVal(r, 'order_id', 'order id', 'orderid') ?? '');
      const sku = String(getVal(r, 'sku', 'product', 'item') ?? '');
      if (!order_id || !sku) continue;
      toInsert.push({
        sourceId,
        organizationId,
        order_id,
        sku,
        quantity: Number(getVal(r, 'quantity', 'qty')) || 0,
        revenue: Number(getVal(r, 'revenue', 'amount', 'sales')) || 0,
        date: toDate(getVal(r, 'date', 'order date', 'created')),
        region: String(getVal(r, 'region', 'location', 'channel') ?? ''),
      });
    }
    if (toInsert.length > 0) {
      await OrderRecord.insertMany(toInsert);
    }
    return { dataType: 'orders', recordCount: toInsert.length };
  }

  if (isInventorySheet(first)) {
    const skuCol = findColumn(first, 'sku', 'product', 'item');
    if (!skuCol) throw new Error('Inventory sheet must have sku column');

    const toInsert: Array<{
      sourceId: string;
      organizationId: string;
      sku: string;
      location: string;
      available_qty: number;
      date: Date;
    }> = [];
    const limited = rows.slice(0, MAX_ROWS);
    for (const row of limited) {
      const r = row as Record<string, unknown>;
      const sku = String(getVal(r, 'sku', 'product', 'item') ?? '');
      if (!sku) continue;
      toInsert.push({
        sourceId,
        organizationId,
        sku,
        location: String(getVal(r, 'location', 'warehouse', 'store') ?? ''),
        available_qty: Number(getVal(r, 'available_qty', 'available qty', 'quantity', 'qty', 'stock')) || 0,
        date: toDate(getVal(r, 'date', 'as_of', 'asof')),
      });
    }
    if (toInsert.length > 0) {
      await InventoryRecord.insertMany(toInsert);
    }
    return { dataType: 'inventory', recordCount: toInsert.length };
  }

  throw new Error('Could not detect data type. Need columns like order_id+revenue (orders) or sku+available_qty (inventory).');
}
