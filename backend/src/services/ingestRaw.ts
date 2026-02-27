import fs from 'fs';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { RawIngestionRecord } from '../models/RawIngestionRecord';

const MAX_ROWS = 50000;

/**
 * Parse CSV to array of objects (first row = headers). No validation.
 */
function parseCsvToRows(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  return rows.slice(0, MAX_ROWS);
}

/**
 * Parse Excel first sheet to array of objects (first row = headers). No validation.
 */
function parseExcelToRows(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath, { type: 'file', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, unknown>[];
  return rows.slice(0, MAX_ROWS);
}

/**
 * Normalize values to plain strings/numbers for storage (so we don't store Date objects etc.).
 */
function toStorableData(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = '';
    } else if (typeof v === 'object' && v instanceof Date) {
      out[k] = (v as Date).toISOString();
    } else if (typeof v === 'object') {
      out[k] = String(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface IngestRawResult {
  inserted: number;
  totalRows: number;
}

/**
 * Ingest CSV file: store every row with its headers as keys. No schema strictness.
 */
export async function ingestRawCsv(
  filePath: string,
  sourceId: string,
  organizationId: string
): Promise<IngestRawResult> {
  const rows = parseCsvToRows(filePath);
  if (rows.length === 0) {
    return { inserted: 0, totalRows: 0 };
  }
  const toInsert = rows.map((row, i) => ({
    sourceId,
    organizationId,
    rowIndex: i,
    data: toStorableData(row as Record<string, unknown>),
  }));
  await RawIngestionRecord.insertMany(toInsert);
  return { inserted: toInsert.length, totalRows: rows.length };
}

/**
 * Ingest Excel file: store every row with its headers as keys. No schema strictness.
 */
export async function ingestRawExcel(
  filePath: string,
  sourceId: string,
  organizationId: string
): Promise<IngestRawResult> {
  const rows = parseExcelToRows(filePath);
  if (rows.length === 0) {
    return { inserted: 0, totalRows: 0 };
  }
  const toInsert = rows.map((row, i) => ({
    sourceId,
    organizationId,
    rowIndex: i,
    data: toStorableData(row),
  }));
  await RawIngestionRecord.insertMany(toInsert);
  return { inserted: toInsert.length, totalRows: rows.length };
}
