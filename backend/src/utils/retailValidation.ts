import type { CanonicalKey } from './columnNormalizer';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: ParsedRetailRow;
}

export interface ParsedRetailRow {
  date: Date;
  sku: string;
  revenue: number;
  units: number;
  traffic: number;
  inventory: number;
  returns: number;
}

function parseDate(v: string): { ok: boolean; date?: Date } {
  if (v == null || String(v).trim() === '') {
    return { ok: false };
  }
  const d = new Date(String(v).trim());
  if (isNaN(d.getTime())) return { ok: false };
  return { ok: true, date: d };
}

function parseNum(v: string | undefined): number {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Validate and parse a normalized row (canonical keys) into typed values.
 * Ensures date exists and is valid; numeric fields are parsed correctly.
 */
export function validateRetailRow(
  row: Partial<Record<CanonicalKey, string>>
): ValidationResult {
  const errors: string[] = [];

  if (row.date == null || String(row.date).trim() === '') {
    errors.push('Missing or empty date');
    return { valid: false, errors };
  }

  const { ok: dateOk, date } = parseDate(row.date);
  if (!dateOk || !date) {
    errors.push(`Invalid date: ${row.date}`);
    return { valid: false, errors };
  }

  const sku = row.sku != null ? String(row.sku).trim() : '';
  if (!sku) {
    errors.push('Missing or empty sku');
    return { valid: false, errors };
  }

  const parsed: ParsedRetailRow = {
    date,
    sku,
    revenue: parseNum(row.revenue),
    units: parseNum(row.units),
    traffic: parseNum(row.traffic),
    inventory: parseNum(row.inventory),
    returns: parseNum(row.returns),
  };

  return { valid: true, errors: [], parsed };
}
