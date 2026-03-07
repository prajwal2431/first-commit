import { parse } from 'csv-parse/sync';
import { buildColumnMap, normalizeRow, CanonicalKey } from '../../utils/columnNormalizer';
import { validateRetailRow } from '../../utils/retailValidation';
import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { TrafficRecord } from '../../models/TrafficRecord';

const MAX_ROWS = 10_000;

export type DetectedDataType = 'retail' | 'orders' | 'inventory' | 'fulfilment' | 'traffic' | 'unknown';

interface IngestResult {
    dataType: DetectedDataType;
    inserted: number;
    skipped: number;
    dateRange: { min: string; max: string } | null;
}

/**
 * Detect what kind of data a CSV contains based on its column headers.
 * This is the "smart router" — rather than forcing the user to specify
 * the data type, we look at the columns and figure it out.
 */
function detectDataType(headers: string[]): DetectedDataType {
    const normalized = new Set(headers.map(h => h.toLowerCase().replace(/[\s_-]+/g, '')));

    // Order detection: has order_id + (revenue|amount|sku)
    const hasOrderId = ['orderid', 'order_id'].some(k =>
        [...normalized].some(h => h.includes(k.replace(/_/g, '')) || h === k.replace(/_/g, ''))
    );
    const hasRevenue = [...normalized].some(h =>
        ['revenue', 'amount', 'sales', 'total'].some(k => h.includes(k))
    );
    const hasSku = [...normalized].some(h =>
        ['sku', 'product', 'item', 'article'].some(k => h.includes(k))
    );

    if (hasOrderId && (hasRevenue || hasSku)) return 'orders';

    // Fulfilment detection: has shipment/dispatch + carrier/status
    const hasFulfilment = [...normalized].some(h =>
        ['shipment', 'dispatch', 'carrier', 'tracking', 'awb'].some(k => h.includes(k))
    );
    if (hasFulfilment) return 'fulfilment';

    // Inventory detection: has sku + (available_qty|stock|location)
    const hasInventoryQty = [...normalized].some(h =>
        ['availableqty', 'available', 'stockonhand', 'stock', 'qty', 'onhand'].some(k => h.includes(k))
    );
    const hasLocation = [...normalized].some(h =>
        ['location', 'warehouse', 'store', 'facility'].some(k => h.includes(k))
    );
    if (hasSku && (hasInventoryQty || hasLocation) && !hasRevenue) return 'inventory';

    // Traffic detection: has visits/sessions/pageviews without revenue
    const hasTraffic = [...normalized].some(h =>
        ['traffic', 'visits', 'sessions', 'pageviews', 'visitors'].some(k => h.includes(k))
    );
    if (hasTraffic && !hasRevenue) return 'traffic';

    // Retail detection: has date + sku + (revenue or units)
    const hasDate = [...normalized].some(h =>
        ['date', 'day', 'dt'].some(k => h === k || h.includes(k))
    );
    const hasUnits = [...normalized].some(h =>
        ['units', 'qty', 'quantity', 'sold', 'volume'].some(k => h.includes(k))
    );
    if (hasDate && hasSku && (hasRevenue || hasUnits)) return 'retail';

    return 'unknown';
}

/**
 * Parse CSV text content (from Google Sheets or any source), auto-detect
 * the data type, and ingest into the correct MongoDB collection.
 *
 * For sheets sync: we do upsert-style ingestion — delete old records
 * from the same sourceId first, then insert fresh data. This ensures
 * we always reflect the latest sheet state.
 */
export async function ingestCsvContent(
    csvContent: string,
    sourceId: string,
    organizationId: string,
    options: { replaceExisting?: boolean } = {}
): Promise<IngestResult> {
    const records: string[][] = parse(csvContent, {
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
    });

    if (records.length < 2) {
        throw new Error('CSV must have a header row and at least one data row');
    }

    const [headerRow, ...dataRows] = records;
    const headers = headerRow.map(h => String(h ?? '').trim());
    const dataType = detectDataType(headers);

    if (dataType === 'unknown') {
        // Fall back to retail if we have at least date + sku columns
        const columnMap = buildColumnMap(headers);
        if (columnMap.size >= 2) {
            return ingestAsRetail(csvContent, sourceId, organizationId, options.replaceExisting);
        }
        throw new Error(
            `Could not detect data type from columns: ${headers.join(', ')}. ` +
            `Expected retail (date, sku, revenue), orders (order_id, sku), ` +
            `inventory (sku, available_qty), or fulfilment (shipment_id, carrier) data.`
        );
    }

    switch (dataType) {
        case 'retail':
            return ingestAsRetail(csvContent, sourceId, organizationId, options.replaceExisting);
        case 'orders':
            return ingestAsOrders(headers, dataRows, sourceId, organizationId, options.replaceExisting);
        case 'inventory':
            return ingestAsInventory(headers, dataRows, sourceId, organizationId, options.replaceExisting);
        default:
            // For fulfilment/traffic, fall back to retail parsing which is most flexible
            return ingestAsRetail(csvContent, sourceId, organizationId, options.replaceExisting);
    }
}

// ─── Retail ingestion ─────────────────────────────────────────────────────
async function ingestAsRetail(
    csvContent: string,
    sourceId: string,
    organizationId: string,
    replaceExisting?: boolean
): Promise<IngestResult> {
    const records: string[][] = parse(csvContent, {
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
    });

    const [headerRow, ...dataRows] = records;
    const headers = headerRow.map(h => String(h ?? '').trim());
    const columnMap = buildColumnMap(headers);

    const validRows: Array<{
        sourceId: string;
        organizationId: string;
        date: Date;
        sku: string;
        revenue: number;
        units: number;
        traffic: number;
        inventory: number;
        returns: number;
    }> = [];
    let skipped = 0;

    for (const row of dataRows.slice(0, MAX_ROWS)) {
        const normalized = normalizeRow(row, columnMap);
        const result = validateRetailRow(normalized);
        if (result.valid && result.parsed) {
            validRows.push({
                sourceId,
                organizationId,
                ...result.parsed,
            });
        } else {
            skipped++;
        }
    }

    if (validRows.length === 0) {
        return { dataType: 'retail', inserted: 0, skipped, dateRange: null };
    }

    // Replace existing data from same source for clean sync
    if (replaceExisting) {
        await RetailRecord.deleteMany({ sourceId });
    }

    await RetailRecord.insertMany(validRows);

    const dates = validRows.map(r => r.date.getTime());
    return {
        dataType: 'retail',
        inserted: validRows.length,
        skipped,
        dateRange: {
            min: new Date(Math.min(...dates)).toISOString().slice(0, 10),
            max: new Date(Math.max(...dates)).toISOString().slice(0, 10),
        },
    };
}

// ─── Orders ingestion ─────────────────────────────────────────────────────
function findCol(headers: string[], ...candidates: string[]): number {
    const norm = headers.map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
    for (const c of candidates) {
        const cn = c.toLowerCase().replace(/[\s_-]+/g, '');
        const idx = norm.findIndex(h => h === cn || h.includes(cn));
        if (idx >= 0) return idx;
    }
    return -1;
}

async function ingestAsOrders(
    headers: string[],
    dataRows: string[][],
    sourceId: string,
    organizationId: string,
    replaceExisting?: boolean
): Promise<IngestResult> {
    const orderIdIdx = findCol(headers, 'order_id', 'orderid', 'order id');
    const skuIdx = findCol(headers, 'sku', 'product', 'item');
    const qtyIdx = findCol(headers, 'quantity', 'qty', 'units');
    const revIdx = findCol(headers, 'revenue', 'amount', 'sales', 'total');
    const dateIdx = findCol(headers, 'date', 'order_date', 'created');
    const regionIdx = findCol(headers, 'region', 'location', 'channel');

    if (orderIdIdx < 0 || skuIdx < 0) {
        throw new Error('Orders data requires order_id and sku columns');
    }

    const toInsert = dataRows.slice(0, MAX_ROWS)
        .map(row => ({
            sourceId,
            organizationId,
            order_id: row[orderIdIdx] || '',
            sku: row[skuIdx] || '',
            quantity: Number(row[qtyIdx] || 0) || 0,
            revenue: Number(row[revIdx] || 0) || 0,
            date: dateIdx >= 0 ? new Date(row[dateIdx]) : new Date(),
            region: regionIdx >= 0 ? (row[regionIdx] || '') : '',
        }))
        .filter(r => r.order_id && r.sku);

    if (replaceExisting) {
        await OrderRecord.deleteMany({ sourceId });
    }

    if (toInsert.length > 0) {
        await OrderRecord.insertMany(toInsert);
    }

    const dates = toInsert.filter(r => !isNaN(r.date.getTime())).map(r => r.date.getTime());
    return {
        dataType: 'orders',
        inserted: toInsert.length,
        skipped: dataRows.length - toInsert.length,
        dateRange: dates.length > 0
            ? { min: new Date(Math.min(...dates)).toISOString().slice(0, 10), max: new Date(Math.max(...dates)).toISOString().slice(0, 10) }
            : null,
    };
}

// ─── Inventory ingestion ─────────────────────────────────────────────────
async function ingestAsInventory(
    headers: string[],
    dataRows: string[][],
    sourceId: string,
    organizationId: string,
    replaceExisting?: boolean
): Promise<IngestResult> {
    const skuIdx = findCol(headers, 'sku', 'product', 'item');
    const qtyIdx = findCol(headers, 'available_qty', 'available qty', 'stock', 'quantity', 'qty', 'on_hand');
    const locIdx = findCol(headers, 'location', 'warehouse', 'store', 'facility');
    const dateIdx = findCol(headers, 'date', 'as_of', 'asof');

    if (skuIdx < 0) {
        throw new Error('Inventory data requires sku column');
    }

    const toInsert = dataRows.slice(0, MAX_ROWS)
        .map(row => ({
            sourceId,
            organizationId,
            sku: row[skuIdx] || '',
            available_qty: Number(row[qtyIdx] || 0) || 0,
            location: locIdx >= 0 ? (row[locIdx] || '') : '',
            date: dateIdx >= 0 ? new Date(row[dateIdx]) : new Date(),
        }))
        .filter(r => r.sku);

    if (replaceExisting) {
        await InventoryRecord.deleteMany({ sourceId });
    }

    if (toInsert.length > 0) {
        await InventoryRecord.insertMany(toInsert);
    }

    const dates = toInsert.filter(r => !isNaN(r.date.getTime())).map(r => r.date.getTime());
    return {
        dataType: 'inventory',
        inserted: toInsert.length,
        skipped: dataRows.length - toInsert.length,
        dateRange: dates.length > 0
            ? { min: new Date(Math.min(...dates)).toISOString().slice(0, 10), max: new Date(Math.max(...dates)).toISOString().slice(0, 10) }
            : null,
    };
}
