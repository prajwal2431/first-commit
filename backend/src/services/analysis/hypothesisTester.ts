import { HypothesisTemplate } from './hypothesisLibrary';
import { DetectedAnomaly } from './anomalyDetector';
import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { TrafficRecord } from '../../models/TrafficRecord';
import { WeatherRecord } from '../../models/WeatherRecord';
import festivalCalendar from '../../data/festival_calendar.json';

export interface TestedHypothesis {
  templateId: string;
  name: string;
  description: string;
  status: 'confirmed' | 'rejected' | 'inconclusive';
  confidenceScore: number;
  contribution: number;
  evidence: Array<{
    query: string;
    result: string;
    supports: boolean;
  }>;
  contributingFactors: string[];
  impactEstimate: {
    lostRevenue: number;
    affectedSkus: string[];
    affectedRegions: string[];
  };
}

export async function testHypotheses(
  organizationId: string,
  hypotheses: HypothesisTemplate[],
  anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis[]> {
  const results: TestedHypothesis[] = [];

  for (const h of hypotheses) {
    const result = await testSingleHypothesis(organizationId, h, anomalies);
    results.push(result);
  }

  return results.sort((a, b) => b.confidenceScore * b.contribution - a.confidenceScore * a.contribution);
}

async function testSingleHypothesis(
  organizationId: string,
  hypothesis: HypothesisTemplate,
  anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  switch (hypothesis.id) {
    case 'H1': return testStockoutHypothesis(organizationId, anomalies);
    case 'H2': return testTrafficDropHypothesis(organizationId, anomalies);
    case 'H3': return testPricePromoHypothesis(organizationId, anomalies);
    case 'H4': return testConversionHypothesis(organizationId, anomalies);
    case 'H5': return testFulfilmentHypothesis(organizationId, anomalies);
    case 'H6': return testReturnsHypothesis(organizationId, anomalies);
    case 'H7': return testFestivalHypothesis(organizationId, anomalies);
    case 'H8': return testWeatherHypothesis(organizationId, anomalies);
    default: return makeInconclusive(hypothesis);
  }
}

async function testStockoutHypothesis(
  organizationId: string,
  anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  const factors: string[] = [];
  let confidence = 0;
  let contribution = 0;
  const affectedSkus: string[] = [];
  const affectedRegions: string[] = [];
  let lostRevenue = 0;

  const latestInventory = await InventoryRecord.aggregate([
    { $match: { organizationId } },
    { $sort: { date: -1 } },
    { $group: { _id: { sku: '$sku', location: '$location' }, qty: { $first: '$available_qty' } } },
  ]);

  const oosItems = latestInventory.filter((i: any) => i.qty <= 0);

  const topSkus = await RetailRecord.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$sku', totalRev: { $sum: '$revenue' }, avgUnits: { $avg: '$units' } } },
    { $sort: { totalRev: -1 } },
    { $limit: 20 },
  ]);

  const topSkuSet = new Set(topSkus.map((s: any) => s._id));
  const oosTopSkus = oosItems.filter((i: any) => topSkuSet.has(i._id.sku));

  if (oosTopSkus.length > 0) {
    evidence.push({
      query: 'Top revenue SKUs with zero inventory',
      result: `${oosTopSkus.length} top SKUs at zero stock: ${oosTopSkus.map((i: any) => `${i._id.sku} at ${i._id.location}`).join(', ')}`,
      supports: true,
    });
    confidence += 0.4;

    for (const oos of oosTopSkus) {
      affectedSkus.push(oos._id.sku);
      affectedRegions.push(oos._id.location);
      const skuData = topSkus.find((s: any) => s._id === oos._id.sku);
      if (skuData) lostRevenue += skuData.avgUnits * 7 * (skuData.totalRev / (skuData.avgUnits * 45 || 1));
    }
  }

  const retailWithDemand = await RetailRecord.aggregate([
    { $match: { organizationId, sku: { $in: affectedSkus } } },
    { $sort: { date: -1 } },
    { $limit: 100 },
    { $group: { _id: '$sku', recentTraffic: { $sum: '$traffic' }, recentUnits: { $sum: '$units' } } },
  ]);

  const demandDespiteOos = retailWithDemand.filter((r: any) => r.recentTraffic > 0 && r.recentUnits < 5);
  if (demandDespiteOos.length > 0) {
    evidence.push({
      query: 'Active demand on OOS SKUs',
      result: `${demandDespiteOos.length} OOS SKUs still receiving traffic: ${demandDespiteOos.map((r: any) => `${r._id} (${r.recentTraffic} sessions)`).join(', ')}`,
      supports: true,
    });
    confidence += 0.3;
    factors.push('Active demand meeting zero inventory');
  }

  const stockElsewhere = await InventoryRecord.aggregate([
    { $match: { organizationId, sku: { $in: affectedSkus } } },
    { $sort: { date: -1 } },
    { $group: { _id: { sku: '$sku', location: '$location' }, qty: { $first: '$available_qty' } } },
    { $match: { qty: { $gt: 0 } } },
  ]);

  if (stockElsewhere.length > 0) {
    evidence.push({
      query: 'Stock availability at other locations',
      result: `Stock found at: ${stockElsewhere.map((s: any) => `${s._id.sku}: ${s.qty} units at ${s._id.location}`).join(', ')}`,
      supports: true,
    });
    confidence += 0.2;
    factors.push(`Stock trapped at other locations: ${stockElsewhere.map((s: any) => s._id.location).join(', ')}`);
  }

  const revenueAnomaly = anomalies.find((a) => a.kpiName.includes('revenue'));
  if (revenueAnomaly) {
    contribution = Math.min(1, oosTopSkus.length / Math.max(topSkus.length, 1));
  }

  return {
    templateId: 'H1',
    name: 'Stockout blocking demand',
    description: 'Key SKUs out of stock in high-demand regions causing revenue loss',
    status: confidence >= 0.5 ? 'confirmed' : confidence > 0.2 ? 'inconclusive' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution,
    evidence,
    contributingFactors: factors,
    impactEstimate: { lostRevenue: Math.round(lostRevenue), affectedSkus, affectedRegions },
  };
}

async function testTrafficDropHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const dailyTraffic = await RetailRecord.aggregate([
    { $match: { organizationId } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, traffic: { $sum: '$traffic' } } },
    { $sort: { _id: 1 } },
  ]);

  if (dailyTraffic.length < 14) {
    return makeInconclusiveWith('H2', 'Traffic drop', 'Insufficient traffic data for comparison');
  }

  const recent = dailyTraffic.slice(-7);
  const prior = dailyTraffic.slice(-14, -7);
  const recentTotal = recent.reduce((s: number, d: any) => s + d.traffic, 0);
  const priorTotal = prior.reduce((s: number, d: any) => s + d.traffic, 0);
  const delta = priorTotal > 0 ? ((recentTotal - priorTotal) / priorTotal) * 100 : 0;

  if (delta < -10) {
    evidence.push({
      query: 'Weekly traffic comparison',
      result: `Traffic down ${Math.abs(delta).toFixed(1)}%: ${priorTotal} → ${recentTotal}`,
      supports: true,
    });
    confidence += 0.5;
    factors.push(`Overall traffic declined ${Math.abs(delta).toFixed(0)}% WoW`);
  } else {
    evidence.push({
      query: 'Weekly traffic comparison',
      result: `Traffic change: ${delta.toFixed(1)}% (not significant)`,
      supports: false,
    });
  }

  const channelTraffic = await TrafficRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: '$channel',
        totalSessions: { $sum: '$sessions' },
        totalSpend: { $sum: '$spend' },
      },
    },
    { $sort: { totalSessions: -1 } },
  ]);

  if (channelTraffic.length > 0) {
    evidence.push({
      query: 'Traffic by channel',
      result: channelTraffic.map((c: any) => `${c._id}: ${c.totalSessions} sessions, ₹${c.totalSpend} spend`).join('; '),
      supports: delta < -10,
    });
    if (delta < -10) confidence += 0.2;
  }

  return {
    templateId: 'H2',
    name: 'Traffic drop',
    description: 'Revenue decline driven by reduced traffic',
    status: confidence >= 0.5 ? 'confirmed' : confidence > 0.2 ? 'inconclusive' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: Math.min(1, Math.abs(delta) / 100),
    evidence,
    contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testPricePromoHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const dailyAOV = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        revenue: { $sum: '$revenue' },
        units: { $sum: '$units' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  if (dailyAOV.length < 14) {
    return makeInconclusiveWith('H3', 'Price/promo impact', 'Insufficient data');
  }

  const recent = dailyAOV.slice(-7);
  const prior = dailyAOV.slice(-14, -7);
  const recentAOV = recent.reduce((s: number, d: any) => s + d.revenue, 0) / Math.max(recent.reduce((s: number, d: any) => s + d.units, 0), 1);
  const priorAOV = prior.reduce((s: number, d: any) => s + d.revenue, 0) / Math.max(prior.reduce((s: number, d: any) => s + d.units, 0), 1);
  const aovDelta = priorAOV > 0 ? ((recentAOV - priorAOV) / priorAOV) * 100 : 0;

  if (Math.abs(aovDelta) > 10) {
    evidence.push({
      query: 'AOV comparison WoW',
      result: `AOV changed ${aovDelta.toFixed(1)}%: ₹${priorAOV.toFixed(0)} → ₹${recentAOV.toFixed(0)}`,
      supports: true,
    });
    confidence += 0.5;
    factors.push(`AOV shifted ${aovDelta.toFixed(0)}%, indicating price/promo effect`);
  } else {
    evidence.push({
      query: 'AOV comparison WoW',
      result: `AOV stable: ${aovDelta.toFixed(1)}% change`,
      supports: false,
    });
  }

  return {
    templateId: 'H3',
    name: 'Price/promo impact',
    description: 'Revenue change driven by pricing or promotional shifts',
    status: confidence >= 0.5 ? 'confirmed' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: Math.min(1, Math.abs(aovDelta) / 100),
    evidence,
    contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testConversionHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const data = await RetailRecord.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        units: { $sum: '$units' },
        traffic: { $sum: '$traffic' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  if (data.length < 14) {
    return makeInconclusiveWith('H4', 'Conversion rate collapse', 'Insufficient data');
  }

  const recent = data.slice(-7);
  const prior = data.slice(-14, -7);

  const rTraffic = recent.reduce((s: number, d: any) => s + d.traffic, 0);
  const pTraffic = prior.reduce((s: number, d: any) => s + d.traffic, 0);
  const rUnits = recent.reduce((s: number, d: any) => s + d.units, 0);
  const pUnits = prior.reduce((s: number, d: any) => s + d.units, 0);

  if (rTraffic === 0 || pTraffic === 0) {
    return makeInconclusiveWith('H4', 'Conversion rate collapse', 'No traffic data');
  }

  const rCVR = (rUnits / rTraffic) * 100;
  const pCVR = (pUnits / pTraffic) * 100;
  const cvrDelta = pCVR > 0 ? ((rCVR - pCVR) / pCVR) * 100 : 0;
  const trafficDelta = pTraffic > 0 ? ((rTraffic - pTraffic) / pTraffic) * 100 : 0;

  if (cvrDelta < -15 && trafficDelta > -5) {
    evidence.push({
      query: 'CVR with stable/growing traffic',
      result: `CVR dropped ${Math.abs(cvrDelta).toFixed(1)}% while traffic changed only ${trafficDelta.toFixed(1)}%`,
      supports: true,
    });
    confidence += 0.6;
    factors.push(`CVR collapsed from ${pCVR.toFixed(2)}% to ${rCVR.toFixed(2)}% despite stable traffic`);
  }

  return {
    templateId: 'H4',
    name: 'Conversion rate collapse',
    description: 'Traffic steady but conversion to orders dropped',
    status: confidence >= 0.5 ? 'confirmed' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: Math.min(1, Math.abs(cvrDelta) / 100),
    evidence,
    contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testFulfilmentHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const fulfilment = await FulfilmentRecord.find({ organizationId }).lean();
  if (fulfilment.length === 0) {
    return makeInconclusiveWith('H5', 'Fulfilment/SLA deterioration', 'No fulfilment data');
  }

  const total = fulfilment.length;
  const delayed = fulfilment.filter((f) => f.delay_days > 0);
  const sla = ((total - delayed.length) / total) * 100;

  if (sla < 90) {
    evidence.push({
      query: 'SLA adherence check',
      result: `SLA adherence: ${sla.toFixed(1)}% (${delayed.length}/${total} delayed)`,
      supports: true,
    });
    confidence += 0.5;
    factors.push(`SLA at ${sla.toFixed(0)}%, ${delayed.length} delayed shipments`);

    const carrierDelay = new Map<string, number>();
    for (const d of delayed) carrierDelay.set(d.carrier, (carrierDelay.get(d.carrier) ?? 0) + 1);
    const worst = Array.from(carrierDelay.entries()).sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      evidence.push({
        query: 'Carrier-level delay analysis',
        result: `Worst carrier: ${worst[0]} with ${worst[1]} delayed shipments`,
        supports: true,
      });
      confidence += 0.2;
      factors.push(`${worst[0]} responsible for ${worst[1]} delays`);
    }
  }

  return {
    templateId: 'H5',
    name: 'Fulfilment/SLA deterioration',
    description: 'Delivery delays causing customer dissatisfaction',
    status: confidence >= 0.5 ? 'confirmed' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: Math.min(1, (100 - sla) / 100),
    evidence,
    contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testReturnsHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const fulfilment = await FulfilmentRecord.find({ organizationId }).lean();
  if (fulfilment.length === 0) {
    const retail = await RetailRecord.aggregate([
      { $match: { organizationId } },
      { $group: { _id: null, totalUnits: { $sum: '$units' }, totalReturns: { $sum: '$returns' } } },
    ]);
    if (retail.length > 0 && retail[0].totalUnits > 0) {
      const rr = (retail[0].totalReturns / retail[0].totalUnits) * 100;
      if (rr > 5) {
        confidence = 0.4;
        evidence.push({
          query: 'Return rate from retail data',
          result: `Return rate: ${rr.toFixed(1)}%`,
          supports: true,
        });
        factors.push(`Return rate of ${rr.toFixed(1)}% above threshold`);
      }
    }
    return {
      templateId: 'H6', name: 'Returns/cancels spike', description: 'High return rate eroding revenue',
      status: confidence >= 0.4 ? 'inconclusive' : 'rejected',
      confidenceScore: confidence, contribution: 0.1, evidence, contributingFactors: factors,
      impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
    };
  }

  const total = fulfilment.length;
  const returned = fulfilment.filter((f) => f.status === 'rto' || f.status === 'returned');
  const cancelled = fulfilment.filter((f) => f.status === 'cancelled');
  const returnRate = (returned.length / total) * 100;
  const cancelRate = (cancelled.length / total) * 100;

  if (returnRate > 5 || cancelRate > 3) {
    evidence.push({
      query: 'Return and cancellation rates',
      result: `Return rate: ${returnRate.toFixed(1)}%, Cancel rate: ${cancelRate.toFixed(1)}%`,
      supports: true,
    });
    confidence += 0.5;
    factors.push(`${returned.length} returns, ${cancelled.length} cancellations`);
  }

  return {
    templateId: 'H6', name: 'Returns/cancels spike', description: 'High return or cancellation rate',
    status: confidence >= 0.5 ? 'confirmed' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: Math.min(1, (returnRate + cancelRate) / 50),
    evidence, contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testFestivalHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const latestData = await RetailRecord.aggregate([
    { $match: { organizationId } },
    { $sort: { date: -1 } },
    { $limit: 1 },
  ]);

  if (latestData.length === 0) {
    return makeInconclusiveWith('H7', 'Festival-driven demand shift', 'No data');
  }

  const latestDate = new Date(latestData[0].date);
  const nearbyFestivals = (festivalCalendar as any[]).filter((f) => {
    const fDate = new Date(f.date);
    return Math.abs(fDate.getTime() - latestDate.getTime()) <= 14 * 86400000;
  });

  if (nearbyFestivals.length > 0) {
    const strongest = nearbyFestivals.sort((a, b) => b.intensity - a.intensity)[0];
    evidence.push({
      query: 'Festival calendar proximity check',
      result: `Active festival: ${strongest.name} (intensity ${strongest.intensity}/5, region: ${strongest.region})`,
      supports: true,
    });
    confidence += 0.3 + (strongest.intensity / 10);
    factors.push(`${strongest.name} festival window active`);
  }

  return {
    templateId: 'H7', name: 'Festival-driven demand shift',
    description: 'Demand pattern change driven by festival season',
    status: confidence >= 0.5 ? 'confirmed' : confidence > 0.2 ? 'inconclusive' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: 0.2,
    evidence, contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

async function testWeatherHypothesis(
  organizationId: string,
  _anomalies: DetectedAnomaly[]
): Promise<TestedHypothesis> {
  const evidence: TestedHypothesis['evidence'] = [];
  let confidence = 0;
  const factors: string[] = [];

  const weather = await WeatherRecord.find({ organizationId }).sort({ date: -1 }).lean();
  if (weather.length === 0) {
    return makeInconclusiveWith('H8', 'Weather-driven category shift', 'No weather data available');
  }

  const recentWeather = weather.slice(0, 7);
  const priorWeather = weather.slice(7, 14);

  if (priorWeather.length > 0) {
    const recentAvgTemp = recentWeather.reduce((s, w) => s + w.temp_max, 0) / recentWeather.length;
    const priorAvgTemp = priorWeather.reduce((s, w) => s + w.temp_max, 0) / priorWeather.length;
    const tempShift = recentAvgTemp - priorAvgTemp;

    if (Math.abs(tempShift) > 5) {
      evidence.push({
        query: 'Temperature shift analysis',
        result: `Temperature shifted ${tempShift.toFixed(1)}°C: ${priorAvgTemp.toFixed(0)}°C → ${recentAvgTemp.toFixed(0)}°C`,
        supports: true,
      });
      confidence += 0.4;
      factors.push(`${Math.abs(tempShift).toFixed(0)}°C temperature ${tempShift < 0 ? 'drop' : 'rise'}`);
    }
  }

  return {
    templateId: 'H8', name: 'Weather-driven category shift',
    description: 'Weather change driving demand for specific categories',
    status: confidence >= 0.4 ? 'confirmed' : confidence > 0.2 ? 'inconclusive' : 'rejected',
    confidenceScore: Math.min(confidence, 1),
    contribution: 0.15,
    evidence, contributingFactors: factors,
    impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}

function makeInconclusive(h: HypothesisTemplate): TestedHypothesis {
  return makeInconclusiveWith(h.id, h.name, 'Insufficient data to test');
}

function makeInconclusiveWith(id: string, name: string, reason: string): TestedHypothesis {
  return {
    templateId: id, name, description: reason,
    status: 'inconclusive', confidenceScore: 0, contribution: 0,
    evidence: [{ query: 'Data availability check', result: reason, supports: false }],
    contributingFactors: [], impactEstimate: { lostRevenue: 0, affectedSkus: [], affectedRegions: [] },
  };
}
