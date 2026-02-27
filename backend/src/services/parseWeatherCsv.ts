import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { WeatherRecord } from '../models/WeatherRecord';

const MAX_ROWS = 10000;

const FIELD_ALIASES: Record<string, string[]> = {
  date: ['date', 'day', 'dt', 'observation_date'],
  region: ['region', 'city', 'state', 'location', 'station'],
  temp_min: ['temp_min', 'min_temp', 'low', 'temperature_min'],
  temp_max: ['temp_max', 'max_temp', 'high', 'temperature_max', 'temperature'],
  rainfall_mm: ['rainfall_mm', 'rainfall', 'rain', 'precipitation', 'precip_mm'],
  humidity: ['humidity', 'relative_humidity', 'rh', 'humidity_pct'],
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

export async function parseWeatherCsv(
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

    if (!obj.date || !obj.region) continue;
    const d = new Date(obj.date);
    if (isNaN(d.getTime())) continue;

    toInsert.push({
      sourceId,
      organizationId,
      date: d,
      region: obj.region,
      temp_min: Number(obj.temp_min) || 0,
      temp_max: Number(obj.temp_max) || 0,
      rainfall_mm: Number(obj.rainfall_mm) || 0,
      humidity: Number(obj.humidity) || 0,
    });
  }

  if (toInsert.length > 0) {
    await WeatherRecord.insertMany(toInsert);
  }
  return { inserted: toInsert.length };
}
