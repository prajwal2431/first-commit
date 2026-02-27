import { DetectedAnomaly } from './anomalyDetector';

export interface HypothesisTemplate {
  id: string;
  name: string;
  description: string;
  triggerKpis: string[];
  requiredData: string[];
  optionalData: string[];
  testQueries: string[];
  confoundChecks: string[];
}

export const HYPOTHESIS_TEMPLATES: HypothesisTemplate[] = [
  {
    id: 'H1',
    name: 'Stockout blocking demand',
    description: 'Revenue drop caused by key SKUs going out of stock in high-demand regions',
    triggerKpis: ['revenue_wow', 'revenue_dod', 'sku_revenue_drop'],
    requiredData: ['inventory'],
    optionalData: ['orders'],
    testQueries: [
      'Check inventory levels for top revenue SKUs',
      'Correlate OOS SKUs with revenue decline contribution',
      'Check if demand exists (traffic/orders) despite zero stock',
    ],
    confoundChecks: ['Not explained by seasonal pattern', 'Not explained by price change'],
  },
  {
    id: 'H2',
    name: 'Traffic drop',
    description: 'Revenue decline driven by reduced traffic from specific channels or campaigns',
    triggerKpis: ['revenue_wow', 'revenue_dod'],
    requiredData: ['retail'],
    optionalData: ['traffic'],
    testQueries: [
      'Compare traffic WoW by channel',
      'Check if CVR is stable (traffic-only issue)',
      'Identify which channel dropped most',
    ],
    confoundChecks: ['Not explained by stockout', 'Not explained by seasonal pattern'],
  },
  {
    id: 'H3',
    name: 'Price/promo impact',
    description: 'Revenue change driven by pricing or promotional activity changes',
    triggerKpis: ['revenue_wow', 'revenue_dod'],
    requiredData: ['retail'],
    optionalData: ['orders'],
    testQueries: [
      'Compare AOV between periods',
      'Check if units stable but revenue changed (price effect)',
      'Look for discount/promo patterns in data',
    ],
    confoundChecks: ['Not explained by mix shift', 'Not explained by stockout'],
  },
  {
    id: 'H4',
    name: 'Conversion rate collapse',
    description: 'Traffic is steady or growing but conversion to orders has dropped',
    triggerKpis: ['revenue_wow', 'conversion_rate'],
    requiredData: ['retail'],
    optionalData: ['traffic'],
    testQueries: [
      'Calculate CVR = units/traffic by period',
      'Check if specific SKUs or categories affected',
      'Correlate with page-level or listing changes',
    ],
    confoundChecks: ['Not explained by stockout of popular items', 'Check if traffic quality changed'],
  },
  {
    id: 'H5',
    name: 'Fulfilment/SLA deterioration',
    description: 'Delivery delays or SLA breaches causing customer dissatisfaction and lower reorders',
    triggerKpis: ['revenue_wow', 'revenue_dod'],
    requiredData: ['fulfilment'],
    optionalData: ['orders'],
    testQueries: [
      'Check SLA adherence trend',
      'Identify carriers/regions with worst delay',
      'Correlate delayed orders with reduced repeat purchases',
    ],
    confoundChecks: ['Not explained by volume spike overwhelming capacity'],
  },
  {
    id: 'H6',
    name: 'Returns/cancels spike',
    description: 'High return or cancellation rate eroding net revenue',
    triggerKpis: ['revenue_wow', 'revenue_dod'],
    requiredData: ['fulfilment'],
    optionalData: ['retail'],
    testQueries: [
      'Calculate return rate and cancel rate by period',
      'Identify SKUs with highest return rate',
      'Check if specific regions or carriers have higher RTO',
    ],
    confoundChecks: ['Not explained by new product quality issue', 'Not explained by COD vs prepaid mix'],
  },
  {
    id: 'H7',
    name: 'Festival-driven demand shift',
    description: 'Demand uplift or pattern change driven by festival/holiday season',
    triggerKpis: ['revenue_wow', 'revenue_dod', 'sku_revenue_drop'],
    requiredData: ['retail'],
    optionalData: ['orders'],
    testQueries: [
      'Check if anomaly period overlaps with festival calendar',
      'Compare with pre/post festival window',
      'Identify categories historically sensitive to this festival',
    ],
    confoundChecks: ['Separate organic trend from festival effect', 'Check if promotion drove the lift instead'],
  },
  {
    id: 'H8',
    name: 'Weather-driven category shift',
    description: 'Weather change (temperature drop, rain) driving demand for specific categories',
    triggerKpis: ['revenue_wow', 'sku_revenue_drop'],
    requiredData: ['retail'],
    optionalData: ['weather'],
    testQueries: [
      'Check weather data for temperature shifts in key regions',
      'Correlate weather change with category/SKU demand change',
      'Check if region-specific demand matches weather region',
    ],
    confoundChecks: ['Not explained by stockout or promo', 'Check if demand shift is localized to weather-affected region'],
  },
];

export function getApplicableHypotheses(
  anomalies: DetectedAnomaly[],
  availableData: Set<string>
): HypothesisTemplate[] {
  const anomalyKpis = new Set(anomalies.map((a) => a.kpiName));

  return HYPOTHESIS_TEMPLATES.filter((h) => {
    const kpiMatch = h.triggerKpis.some((k) => anomalyKpis.has(k));
    const dataMatch = h.requiredData.every((d) => availableData.has(d));
    return kpiMatch && dataMatch;
  });
}
