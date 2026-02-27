import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { buildColumnMap, normalizeRow } from '../utils/columnNormalizer';
import { validateRetailRow } from '../utils/retailValidation';
import type { ParsedRetailRow } from '../utils/retailValidation';
import { RetailRecord } from '../models/RetailRecord';

const MAX_ROWS = 10000; // cap for prototype (covers 30–60+ days by SKU)

export interface RetailCsvSummary {
  totalRowsProcessed: number;
  validRows: number;
  invalidRowsCount: number;
  dateRange: { min: string; max: string };
  skuCount: number;
}

export interface ParseRetailCsvResult {
  summary: RetailCsvSummary;
  inserted: number;
}

/**
 * Parse CSV file, normalize columns, validate rows, and insert into MongoDB.
 * Supports 30–60+ days of historical retail data.
 */
export async function parseRetailCsv(
  filePath: string,
  sourceId: string,
  organizationId: string
): Promise<ParseRetailCsvResult> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records: string[][] = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const [headerRow, ...dataRows] = records;
  const headers = headerRow.map((h) => String(h ?? '').trim());
  const columnMap = buildColumnMap(headers);

  if (columnMap.size === 0) {
    throw new Error(
      'No recognizable columns. Expected at least: date, sku (and optionally revenue, units, traffic, inventory, returns)'
    );
  }

  const validParsed: ParsedRetailRow[] = [];
  let invalidRowsCount = 0;
  const limitedRows = dataRows.slice(0, MAX_ROWS);

  for (const row of limitedRows) {
    const normalized = normalizeRow(row, columnMap);
    const result = validateRetailRow(normalized);
    if (result.valid && result.parsed) {
      validParsed.push(result.parsed);
    } else {
      invalidRowsCount++;
    }
  }

  const totalRowsProcessed = limitedRows.length;
  let dateMin = '';
  let dateMax = '';
  const skuSet = new Set<string>();

  if (validParsed.length > 0) {
    const dates = validParsed.map((p) => p.date.getTime());
    dateMin = new Date(Math.min(...dates)).toISOString().slice(0, 10);
    dateMax = new Date(Math.max(...dates)).toISOString().slice(0, 10);
    validParsed.forEach((p) => skuSet.add(p.sku));
  }

  const toInsert = validParsed.map((p) => ({
    sourceId,
    organizationId,
    date: p.date,
    sku: p.sku,
    revenue: p.revenue,
    units: p.units,
    traffic: p.traffic,
    inventory: p.inventory,
    returns: p.returns,
  }));

  let inserted = 0;
  if (toInsert.length > 0) {
    await RetailRecord.insertMany(toInsert);
    inserted = toInsert.length;
  }

  const summary: RetailCsvSummary = {
    totalRowsProcessed,
    validRows: inserted,
    invalidRowsCount,
    dateRange: { min: dateMin, max: dateMax },
    skuCount: skuSet.size,
  };

  return { summary, inserted };
}
