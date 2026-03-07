import { HypothesisTemplate } from './hypothesisLibrary';
import { DetectedAnomaly } from './anomalyDetector';
import { listRetailByOrg } from '../../db/retailRecordRepo';
import { listOrdersByOrg } from '../../db/orderRepo';
import { listInventoryByOrg } from '../../db/inventoryRepo';
import { listFulfilmentByOrg } from '../../db/fulfilmentRecordRepo';
import { listTrafficByOrg } from '../../db/trafficRecordRepo';
import { listWeatherByOrg } from '../../db/weatherRecordRepo';
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

  const invData = await listInventoryByOrg(organizationId);
  const bySkuLoc = new Map<string, { _id: { sku: string; location: string }; qty: number }>();
  for (const r of invData) {
    const key = `${r.sku}|${r.location}`;
    if (!bySkuLoc.has(key)) bySkuLoc.set(key, { _id: { sku: r.sku, location: r.location }, qty: r.available_qty });
  }
  const latestInventory = Array.from(bySkuLoc.values());
  const oosItems = latestInventory.filter((i) => i.qty <= 0);

  const retailData = await listRetailByOrg(organizationId);
  const skuRev = new Map<string, { totalRev: number; sumUnits: number; count: number }>();
  for (const r of retailData) {
    const ex = skuRev.get(r.sku) ?? { totalRev: 0, sumUnits: 0, count: 0 };
    ex.totalRev += r.revenue;
    ex.sumUnits += r.units;
    ex.count += 1;
    skuRev.set(r.sku, ex);
  }
  const topSkus = Array.from(skuRev.entries())
    .map(([_id, d]) => ({ _id, totalRev: d.totalRev, avgUnits: d.count > 0 ? d.sumUnits / d.count : 0 }))
    .sort((a, b) => b.totalRev - a.totalRev)
    .slice(0, 20);

  const topSkuSet = new Set(topSkus.map((s) => s._id));
  const oosTopSkus = oosItems.filter((i) => topSkuSet.has(i._id.sku));

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
      const skuData = topSkus.find((s) => s._id === oos._id.sku);
      if (skuData) lostRevenue += skuData.avgUnits * 7 * (skuData.totalRev / (skuData.avgUnits * 45 || 1));
    }
  }

  const affectedSet = new Set(affectedSkus);
  const retailFiltered = retailData.filter((r) => affectedSet.has(r.sku)).slice(-100);
  const demandBySku = new Map<string, { recentTraffic: number; recentUnits: number }>();
  for (const r of retailFiltered) {
    const ex = demandBySku.get(r.sku) ?? { recentTraffic: 0, recentUnits: 0 };
    ex.recentTraffic += r.traffic;
    ex.recentUnits += r.units;
    demandBySku.set(r.sku, ex);
  }
  const retailWithDemand = Array.from(demandBySku.entries()).map(([_id, d]) => ({ _id, ...d }));

  const demandDespiteOos = retailWithDemand.filter((r) => r.recentTraffic > 0 && r.recentUnits < 5);
  if (demandDespiteOos.length > 0) {
    evidence.push({
      query: 'Active demand on OOS SKUs',
      result: `${demandDespiteOos.length} OOS SKUs still receiving traffic: ${demandDespiteOos.map((r) => `${r._id} (${r.recentTraffic} sessions)`).join(', ')}`,
      supports: true,
    });
    confidence += 0.3;
    factors.push('Active demand meeting zero inventory');
  }

  const invForSkus = invData.filter((r) => affectedSet.has(r.sku));
  const stockElsewhereByKey = new Map<string, { _id: { sku: string; location: string }; qty: number }>();
  for (const r of invForSkus) {
    const key = `${r.sku}|${r.location}`;
    if (!stockElsewhereByKey.has(key)) stockElsewhereByKey.set(key, { _id: { sku: r.sku, location: r.location }, qty: r.available_qty });
  }
  const stockElsewhere = Array.from(stockElsewhereByKey.values()).filter((s) => s.qty > 0);

  if (stockElsewhere.length > 0) {
    evidence.push({
      query: 'Stock availability at other locations',
      result: `Stock found at: ${stockElsewhere.map((s) => `${s._id.sku}: ${s.qty} units at ${s._id.location}`).join(', ')}`,
      supports: true,
    });
    confidence += 0.2;
    factors.push(`Stock trapped at other locations: ${stockElsewhere.map((s) => s._id.location).join(', ')}`);
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

  const retailForTraffic = await listRetailByOrg(organizationId);
  const dailyTrafficMap = new Map<string, number>();
  for (const r of retailForTraffic) {
    const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    dailyTrafficMap.set(key, (dailyTrafficMap.get(key) ?? 0) + r.traffic);
  }
  const dailyTraffic = Array.from(dailyTrafficMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([_id, traffic]) => ({ _id, traffic }));

  if (dailyTraffic.length < 14) {
    return makeInconclusiveWith('H2', 'Traffic drop', 'Insufficient traffic data for comparison');
  }

  const recent = dailyTraffic.slice(-7);
  const prior = dailyTraffic.slice(-14, -7);
  const recentTotal = recent.reduce((s, d) => s + d.traffic, 0);
  const priorTotal = prior.reduce((s, d) => s + d.traffic, 0);
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

  const trafficData = await listTrafficByOrg(organizationId);
  const channelMap = new Map<string, { totalSessions: number; totalSpend: number }>();
  for (const t of trafficData) {
    const key = t.channel || 'default';
    const ex = channelMap.get(key) ?? { totalSessions: 0, totalSpend: 0 };
    ex.totalSessions += t.sessions;
    ex.totalSpend += t.spend;
    channelMap.set(key, ex);
  }
  const channelTraffic = Array.from(channelMap.entries())
    .map(([_id, d]) => ({ _id, totalSessions: d.totalSessions, totalSpend: d.totalSpend }))
    .sort((a, b) => b.totalSessions - a.totalSessions);

  if (channelTraffic.length > 0) {
    evidence.push({
      query: 'Traffic by channel',
      result: channelTraffic.map((c) => `${c._id}: ${c.totalSessions} sessions, ₹${c.totalSpend} spend`).join('; '),
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

  const retailForAOV = await listRetailByOrg(organizationId);
  const dailyAOVMap = new Map<string, { revenue: number; units: number }>();
  for (const r of retailForAOV) {
    const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    const ex = dailyAOVMap.get(key) ?? { revenue: 0, units: 0 };
    ex.revenue += r.revenue;
    ex.units += r.units;
    dailyAOVMap.set(key, ex);
  }
  const dailyAOV = Array.from(dailyAOVMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([_id, d]) => ({ _id, revenue: d.revenue, units: d.units }));

  if (dailyAOV.length < 14) {
    return makeInconclusiveWith('H3', 'Price/promo impact', 'Insufficient data');
  }

  const recent = dailyAOV.slice(-7);
  const prior = dailyAOV.slice(-14, -7);
  const recentAOV = recent.reduce((s, d) => s + d.revenue, 0) / Math.max(recent.reduce((s, d) => s + d.units, 0), 1);
  const priorAOV = prior.reduce((s, d) => s + d.revenue, 0) / Math.max(prior.reduce((s, d) => s + d.units, 0), 1);
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

  const retailForCVR = await listRetailByOrg(organizationId);
  const dataMap = new Map<string, { units: number; traffic: number }>();
  for (const r of retailForCVR) {
    const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
    const ex = dataMap.get(key) ?? { units: 0, traffic: 0 };
    ex.units += r.units;
    ex.traffic += r.traffic;
    dataMap.set(key, ex);
  }
  const data = Array.from(dataMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([_id, d]) => ({ _id, units: d.units, traffic: d.traffic }));

  if (data.length < 14) {
    return makeInconclusiveWith('H4', 'Conversion rate collapse', 'Insufficient data');
  }

  const recent = data.slice(-7);
  const prior = data.slice(-14, -7);

  const rTraffic = recent.reduce((s, d) => s + d.traffic, 0);
  const pTraffic = prior.reduce((s, d) => s + d.traffic, 0);
  const rUnits = recent.reduce((s, d) => s + d.units, 0);
  const pUnits = prior.reduce((s, d) => s + d.units, 0);

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

  const fulfilment = await listFulfilmentByOrg(organizationId);
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

  const fulfilment = await listFulfilmentByOrg(organizationId);
  if (fulfilment.length === 0) {
    const retailDataReturns = await listRetailByOrg(organizationId);
    let totalUnits = 0;
    let totalReturns = 0;
    for (const r of retailDataReturns) {
      totalUnits += r.units;
      totalReturns += r.returns;
    }
    const retail = totalUnits > 0 ? [{ totalUnits, totalReturns }] : [];
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

  const retailForFestival = await listRetailByOrg(organizationId);
  if (retailForFestival.length === 0) {
    return makeInconclusiveWith('H7', 'Festival-driven demand shift', 'No data');
  }
  const latestData = [{ date: retailForFestival[retailForFestival.length - 1]?.date ?? '' }];
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

  const weather = await listWeatherByOrg(organizationId);
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
