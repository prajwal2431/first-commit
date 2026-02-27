/**
 * Maps CSV header names to canonical retail schema fields.
 * Handles common variants: sales → revenue, qty → units, etc.
 */

const CANONICAL_KEYS = [
  'date',
  'sku',
  'revenue',
  'units',
  'traffic',
  'inventory',
  'returns',
] as const;

export type CanonicalKey = (typeof CANONICAL_KEYS)[number];

const ALIASES: Record<CanonicalKey, string[]> = {
  date: ['date', 'day', 'dt', 'order date', 'transaction date'],
  sku: ['sku', 'product', 'product_id', 'item', 'item_id', 'article'],
  revenue: ['revenue', 'sales', 'amount', 'value', 'total', 'revenue_usd', 'sales_amount'],
  units: ['units', 'qty', 'quantity', 'quantity_sold', 'sold', 'volume'],
  traffic: ['traffic', 'visits', 'sessions', 'views', 'page_views', 'visitors'],
  inventory: ['inventory', 'stock', 'on_hand', 'available', 'qty_on_hand', 'stock_qty'],
  returns: ['returns', 'returned', 'return_qty', 'return_units', 'refunds'],
};

function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .trim();
}

/**
 * Returns a map from original header index/name to canonical key.
 * Headers not matching any alias are omitted.
 */
export function buildColumnMap(headers: string[]): Map<number, CanonicalKey> {
  const map = new Map<number, CanonicalKey>();
  const normalizedHeaders = headers.map(normalizeHeader);

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const n = normalizedHeaders[i];
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
      const match = aliases.some(
        (a) => n === normalizeHeader(a) || n.includes(normalizeHeader(a)) || normalizeHeader(a).includes(n)
      );
      if (match) {
        map.set(i, canonical as CanonicalKey);
        break;
      }
    }
  }
  return map;
}

/**
 * Convert a raw row (array of values) to an object keyed by canonical names.
 */
export function normalizeRow(
  values: string[],
  columnMap: Map<number, CanonicalKey>
): Partial<Record<CanonicalKey, string>> {
  const out: Partial<Record<CanonicalKey, string>> = {};
  for (let i = 0; i < values.length; i++) {
    const key = columnMap.get(i);
    if (key != null && values[i] !== undefined && values[i] !== '') {
      out[key] = String(values[i]).trim();
    }
  }
  return out;
}
