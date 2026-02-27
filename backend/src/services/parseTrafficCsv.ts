import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { TrafficRecord } from '../models/TrafficRecord';

const MAX_ROWS = 10000;

const FIELD_ALIASES: Record<string, string[]> = {
  date: ['date', 'day', 'dt', 'report_date'],
  channel: ['channel', 'source', 'medium', 'platform', 'ad_source', 'utm_source'],
  sku: ['sku', 'product', 'product_id', 'item', 'listing'],
  sessions: ['sessions', 'visits', 'traffic', 'visitors', 'unique_visitors'],
  impressions: ['impressions', 'views', 'page_views', 'ad_impressions'],
  clicks: ['clicks', 'click', 'ad_clicks', 'link_clicks'],
  spend: ['spend', 'cost', 'ad_spend', 'amount_spent', 'budget'],
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

export async function parseTrafficCsv(
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
    if (!obj.date) continue;
    const d = new Date(obj.date);
    if (isNaN(d.getTime())) continue;

    toInsert.push({
      sourceId,
      organizationId,
      date: d,
      channel: obj.channel ?? '',
      sku: obj.sku ?? '',
      sessions: Number(obj.sessions) || 0,
      impressions: Number(obj.impressions) || 0,
      clicks: Number(obj.clicks) || 0,
      spend: Number(obj.spend) || 0,
    });
  }

  if (toInsert.length > 0) {
    await TrafficRecord.insertMany(toInsert);
  }
  return { inserted: toInsert.length };
}
