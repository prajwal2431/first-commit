import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { LiveSignal, RevenueSeriesPoint, RARDecomposition } from '../../models/DashboardState';
import { SignalThresholds } from '../../models/OrgSettings';
import crypto from 'crypto';

interface RevenueKpis {
  totalRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number;
  totalOrders: number;
  ordersDelta: number;
  avgOrderValue: number;
  aovDelta: number;
  revenueAtRiskTotal: number;
  rarDecomposition: RARDecomposition;
}

export interface RevenueAtRiskResult {
  series: RevenueSeriesPoint[];
  signals: LiveSignal[];
  kpis: RevenueKpis;
}

export async function computeRevenueAtRisk(
  organizationId: string,
  thresholds: SignalThresholds
): Promise<RevenueAtRiskResult> {
  const emptyDecomposition: RARDecomposition = {
    inventoryLeak: 0, conversionLeak: 0, opsLeak: 0,
    channelMixLeak: 0, explainedBySeason: 0,
  };
  const emptyKpis: RevenueKpis = {
    totalRevenue: 0, revenueDelta: 0, revenueDeltaPercent: 0,
    totalOrders: 0, ordersDelta: 0, avgOrderValue: 0, aovDelta: 0,
    revenueAtRiskTotal: 0, rarDecomposition: emptyDecomposition,
  };

  const retailData = await RetailRecord.find({ organizationId })
    .sort({ date: 1 })
    .lean();

  const orderData = await OrderRecord.find({ organizationId })
    .sort({ date: 1 })
    .lean();

  if (retailData.length === 0 && orderData.length === 0) {
    return { series: [], signals: [], kpis: emptyKpis };
  }

  // ─── Aggregate daily metrics ───────────────────────────────────────────
  const dailyMap = new Map<string, { revenue: number; traffic: number; orders: number; units: number }>();

  for (const r of retailData) {
    const key = new Date(r.date).toISOString().slice(0, 10);
    const existing = dailyMap.get(key) ?? { revenue: 0, traffic: 0, orders: 0, units: 0 };
    existing.revenue += r.revenue;
    existing.traffic += r.traffic;
    existing.units += r.units;
    existing.orders += 1;
    dailyMap.set(key, existing);
  }

  for (const o of orderData) {
    const key = new Date(o.date).toISOString().slice(0, 10);
    const existing = dailyMap.get(key) ?? { revenue: 0, traffic: 0, orders: 0, units: 0 };
    existing.revenue += o.revenue;
    existing.orders += 1;
    existing.units += o.quantity;
    dailyMap.set(key, existing);
  }

  const sortedDays = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const series: RevenueSeriesPoint[] = sortedDays.map(([date, d]) => ({
    date,
    revenue: Math.round(d.revenue),
    traffic: d.traffic,
    orders: d.orders,
  }));

  const signals: LiveSignal[] = [];

  if (sortedDays.length >= 2) {
    const recentDays = sortedDays.slice(-7);
    const priorDays = sortedDays.slice(-14, -7);

    const recentRevenue = recentDays.reduce((s, [, d]) => s + d.revenue, 0);
    const priorRevenue = priorDays.reduce((s, [, d]) => s + d.revenue, 0);
    const recentTraffic = recentDays.reduce((s, [, d]) => s + d.traffic, 0);
    const priorTraffic = priorDays.reduce((s, [, d]) => s + d.traffic, 0);
    const recentOrders = recentDays.reduce((s, [, d]) => s + d.orders, 0);
    const priorOrders = priorDays.reduce((s, [, d]) => s + d.orders, 0);
    const recentUnits = recentDays.reduce((s, [, d]) => s + d.units, 0);

    const revDelta = priorRevenue > 0
      ? ((recentRevenue - priorRevenue) / priorRevenue) * 100
      : 0;
    const trafficDelta = priorTraffic > 0
      ? ((recentTraffic - priorTraffic) / priorTraffic) * 100
      : 0;
    const orderDelta = priorOrders > 0
      ? ((recentOrders - priorOrders) / priorOrders) * 100
      : 0;

    // ─── RAR Decomposition ─────────────────────────────────────────────
    const rarDecomposition: RARDecomposition = {
      inventoryLeak: 0,
      conversionLeak: 0,
      opsLeak: 0,
      channelMixLeak: 0,
      explainedBySeason: 0,
    };

    const baselineRevenue = priorRevenue > 0 ? priorRevenue : recentRevenue;
    let totalRAR = 0;

    // Layer A: Expected vs Actual revenue gap
    if (revDelta < 0 && priorRevenue > 0) {
      totalRAR = priorRevenue - recentRevenue;
    }

    // Layer B: Decompose the gap into buckets

    // 1. Conversion leak — traffic exists but conversion is failing
    if (recentTraffic > 0 && priorTraffic > 0) {
      const priorCvr = priorOrders / priorTraffic;
      const recentCvr = recentOrders / recentTraffic;
      if (recentCvr < priorCvr) {
        // Lost revenue due to conversion drop = sessions * (expectedCVR - actualCVR) * AOV
        const aov = recentOrders > 0 ? recentRevenue / recentOrders : (priorRevenue / priorOrders);
        rarDecomposition.conversionLeak = Math.round(
          recentTraffic * (priorCvr - recentCvr) * aov
        );
      }
    }

    // 2. Inventory leak — check for OOS in high-demand SKUs
    try {
      const inventoryData = await InventoryRecord.find({ organizationId })
        .sort({ date: -1 }).limit(200).lean();
      const oosSkus = inventoryData.filter((r: any) => r.available_qty <= 0);
      if (oosSkus.length > 0) {
        // Estimate lost revenue from OOS SKUs by looking at their prior revenue contribution
        const oosSkuNames = new Set(oosSkus.map((r: any) => r.sku));
        const priorRevBySku = retailData
          .filter((r) => oosSkuNames.has(r.sku))
          .reduce((s, r) => s + r.revenue, 0);
        // Proportional share of OOS SKUs' contribution
        const avgDailyContribution = priorRevBySku / Math.max(sortedDays.length, 1);
        rarDecomposition.inventoryLeak = Math.round(avgDailyContribution * 7);
      }
    } catch { /* inventory data may not exist */ }

    // 3. Ops leak — returns and cancellations eroding revenue
    try {
      const fulfilmentData = await FulfilmentRecord.find({ organizationId })
        .sort({ dispatch_date: -1 }).limit(500).lean();
      const total = fulfilmentData.length;
      const returned = fulfilmentData.filter((r: any) => r.status === 'rto' || r.status === 'returned');
      const cancelled = fulfilmentData.filter((r: any) => r.status === 'cancelled');
      if (total > 0) {
        const aov = recentOrders > 0 ? recentRevenue / recentOrders : 500;
        rarDecomposition.opsLeak = Math.round((returned.length + cancelled.length) * aov * 0.3);
      }
    } catch { /* fulfilment data may not exist */ }

    // 4. Channel mix leak — placeholder (requires channel-level data)
    rarDecomposition.channelMixLeak = 0;

    // 5. Explained by season — placeholder
    rarDecomposition.explainedBySeason = 0;

    // Ensure decomposition doesn't exceed total RAR
    const decompositionTotal = rarDecomposition.inventoryLeak + rarDecomposition.conversionLeak +
      rarDecomposition.opsLeak + rarDecomposition.channelMixLeak;
    if (decompositionTotal > totalRAR && totalRAR > 0) {
      const scale = totalRAR / decompositionTotal;
      rarDecomposition.inventoryLeak = Math.round(rarDecomposition.inventoryLeak * scale);
      rarDecomposition.conversionLeak = Math.round(rarDecomposition.conversionLeak * scale);
      rarDecomposition.opsLeak = Math.round(rarDecomposition.opsLeak * scale);
      rarDecomposition.channelMixLeak = Math.round(rarDecomposition.channelMixLeak * scale);
    }

    // If totalRAR is positive but decomposition is less, attribute remainder to conversion
    if (totalRAR > 0 && decompositionTotal < totalRAR) {
      rarDecomposition.conversionLeak += Math.round(totalRAR - decompositionTotal);
    }

    // ─── Signal Detection (threshold-aware) ────────────────────────────
    // Signal 1: WoW revenue drop
    if (revDelta < -thresholds.revenueDropWoW) {
      const confidence = computeConfidence(sortedDays.length, true, true);
      signals.push({
        id: crypto.randomUUID(),
        severity: revDelta < -(thresholds.revenueDropWoW * 1.7) ? 'critical' : 'high',
        monitorType: 'revenue',
        title: `Revenue drop: ${revDelta.toFixed(1)}% WoW`,
        description: `Weekly revenue fell from ₹${formatNum(priorRevenue)} to ₹${formatNum(recentRevenue)}`,
        suggestedQuery: 'Why is revenue dropping this week?',
        evidenceSnippet: `Revenue declined ${Math.abs(revDelta).toFixed(1)}% compared to previous week`,
        detectedAt: new Date(),
        impact: {
          revenueAtRisk: Math.round(totalRAR),
          confidence,
          drivers: buildDrivers(rarDecomposition, totalRAR),
        },
      });
    }

    // Signal 2: Traffic up, CVR down
    if (
      trafficDelta > thresholds.trafficUpCvrDown.trafficDelta &&
      revDelta < thresholds.trafficUpCvrDown.revenueDelta
    ) {
      const confidence = computeConfidence(sortedDays.length, recentTraffic > 0, true);
      signals.push({
        id: crypto.randomUUID(),
        severity: 'critical',
        monitorType: 'revenue',
        title: 'Revenue dropping despite high traffic',
        description: `Traffic up ${trafficDelta.toFixed(0)}% but revenue down ${Math.abs(revDelta).toFixed(0)}%`,
        suggestedQuery: 'Why is revenue dropping despite high traffic?',
        evidenceSnippet: `Traffic-revenue gap: traffic +${trafficDelta.toFixed(0)}% vs revenue ${revDelta.toFixed(0)}%`,
        detectedAt: new Date(),
        impact: {
          revenueAtRisk: Math.round(rarDecomposition.conversionLeak),
          confidence,
          drivers: [
            { driver: 'Conversion rate decline', contribution: 60 },
            { driver: 'Traffic quality shift', contribution: 25 },
            { driver: 'Pricing/offer mismatch', contribution: 15 },
          ],
        },
      });
    }

    // Signal 3: Day-over-day revenue drop
    const last = sortedDays[sortedDays.length - 1][1];
    const prev = sortedDays[sortedDays.length - 2][1];
    const dodDelta = prev.revenue > 0
      ? ((last.revenue - prev.revenue) / prev.revenue) * 100
      : 0;
    if (dodDelta < -thresholds.revenueDropDoD) {
      const confidence = computeConfidence(sortedDays.length, true, false);
      signals.push({
        id: crypto.randomUUID(),
        severity: dodDelta < -(thresholds.revenueDropDoD * 2) ? 'high' : 'medium',
        monitorType: 'revenue',
        title: `Day-over-day revenue drop: ${dodDelta.toFixed(1)}%`,
        description: `Revenue fell from ₹${formatNum(prev.revenue)} to ₹${formatNum(last.revenue)}`,
        suggestedQuery: 'What caused the sudden revenue drop today?',
        evidenceSnippet: `DoD revenue decline of ${Math.abs(dodDelta).toFixed(1)}%`,
        detectedAt: new Date(),
        impact: {
          revenueAtRisk: Math.round(prev.revenue - last.revenue),
          confidence,
          drivers: [{ driver: 'Daily revenue variation', contribution: 100 }],
        },
      });
    }

    // Signal 4: Top SKU revenue drop
    const topSkusByRevenue = await getTopSkuContributors(organizationId, recentDays, priorDays);
    if (topSkusByRevenue.length > 0) {
      const worstSku = topSkusByRevenue[0];
      if (worstSku.delta < -thresholds.topSkuRevenueDrop) {
        signals.push({
          id: crypto.randomUUID(),
          severity: 'high',
          monitorType: 'revenue',
          title: `Top SKU revenue drop: ${worstSku.sku}`,
          description: `${worstSku.sku} revenue down ${Math.abs(worstSku.delta).toFixed(0)}%`,
          suggestedQuery: `Why is ${worstSku.sku} revenue dropping?`,
          evidenceSnippet: `SKU ${worstSku.sku} contributed ₹${formatNum(worstSku.lostRevenue)} in lost revenue`,
          detectedAt: new Date(),
          impact: {
            revenueAtRisk: Math.round(worstSku.lostRevenue),
            confidence: computeConfidence(sortedDays.length, true, true),
            drivers: [
              { driver: `SKU ${worstSku.sku} decline`, contribution: 70 },
              { driver: 'Category demand shift', contribution: 30 },
            ],
          },
        });
      }
    }

    // Signal 5: AOV collapse
    const aov = recentOrders > 0 ? recentRevenue / recentOrders : 0;
    const priorAov = priorOrders > 0 ? priorRevenue / priorOrders : 0;
    const aovDeltaPct = priorAov > 0 ? ((aov - priorAov) / priorAov) * 100 : 0;
    if (aovDeltaPct < -thresholds.aovCollapse) {
      signals.push({
        id: crypto.randomUUID(),
        severity: 'high',
        monitorType: 'revenue',
        title: `AOV collapse: ${aovDeltaPct.toFixed(1)}%`,
        description: `Average order value fell from ₹${Math.round(priorAov)} to ₹${Math.round(aov)}`,
        suggestedQuery: 'Why has average order value dropped?',
        evidenceSnippet: `AOV dropped ${Math.abs(aovDeltaPct).toFixed(1)}% WoW`,
        detectedAt: new Date(),
        impact: {
          revenueAtRisk: Math.round(recentOrders * (priorAov - aov)),
          confidence: computeConfidence(sortedDays.length, true, true),
          drivers: [
            { driver: 'Discounting / price erosion', contribution: 50 },
            { driver: 'Product mix shift', contribution: 35 },
            { driver: 'Cart size reduction', contribution: 15 },
          ],
        },
      });
    }

    const totalRevenue = recentRevenue;
    const totalOrders = recentOrders;

    return {
      series,
      signals,
      kpis: {
        totalRevenue: Math.round(totalRevenue),
        revenueDelta: Math.round(recentRevenue - priorRevenue),
        revenueDeltaPercent: Math.round(revDelta * 10) / 10,
        totalOrders,
        ordersDelta: totalOrders - priorOrders,
        avgOrderValue: Math.round(aov),
        aovDelta: Math.round((aov - priorAov) * 10) / 10,
        revenueAtRiskTotal: Math.round(Math.max(0, totalRAR)),
        rarDecomposition,
      },
    };
  }

  // Fallback: too little data
  const totalRevenue = sortedDays.reduce((s, [, d]) => s + d.revenue, 0);
  const totalOrders = sortedDays.reduce((s, [, d]) => s + d.orders, 0);

  return {
    series,
    signals,
    kpis: {
      totalRevenue: Math.round(totalRevenue),
      revenueDelta: 0,
      revenueDeltaPercent: 0,
      totalOrders,
      ordersDelta: 0,
      avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      aovDelta: 0,
      revenueAtRiskTotal: 0,
      rarDecomposition: { inventoryLeak: 0, conversionLeak: 0, opsLeak: 0, channelMixLeak: 0, explainedBySeason: 0 },
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildDrivers(decomp: RARDecomposition, total: number): Array<{ driver: string; contribution: number }> {
  if (total <= 0) return [];
  const drivers: Array<{ driver: string; contribution: number }> = [];
  if (decomp.inventoryLeak > 0) drivers.push({ driver: 'Inventory stockouts', contribution: Math.round((decomp.inventoryLeak / total) * 100) });
  if (decomp.conversionLeak > 0) drivers.push({ driver: 'Conversion decline', contribution: Math.round((decomp.conversionLeak / total) * 100) });
  if (decomp.opsLeak > 0) drivers.push({ driver: 'Returns & cancellations', contribution: Math.round((decomp.opsLeak / total) * 100) });
  if (decomp.channelMixLeak > 0) drivers.push({ driver: 'Channel mix shift', contribution: Math.round((decomp.channelMixLeak / total) * 100) });
  if (decomp.explainedBySeason > 0) drivers.push({ driver: 'Seasonal adjustment', contribution: Math.round((decomp.explainedBySeason / total) * 100) });
  return drivers.sort((a, b) => b.contribution - a.contribution);
}

function computeConfidence(dataPointCount: number, hasTraffic: boolean, hasMultiplePeriods: boolean): number {
  let confidence = 50;
  if (dataPointCount >= 14) confidence += 20;
  else if (dataPointCount >= 7) confidence += 10;
  if (hasTraffic) confidence += 15;
  if (hasMultiplePeriods) confidence += 15;
  return Math.min(confidence, 98);
}

async function getTopSkuContributors(
  organizationId: string,
  recentDays: [string, { revenue: number }][],
  priorDays: [string, { revenue: number }][]
): Promise<Array<{ sku: string; delta: number; lostRevenue: number }>> {
  const recentDates = recentDays.map(([d]) => d);
  const priorDates = priorDays.map(([d]) => d);

  const [recentSkus, priorSkus] = await Promise.all([
    RetailRecord.aggregate([
      {
        $match: {
          organizationId,
          $expr: {
            $in: [{ $dateToString: { format: '%Y-%m-%d', date: '$date' } }, recentDates],
          },
        },
      },
      { $group: { _id: '$sku', revenue: { $sum: '$revenue' } } },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
    ]),
    RetailRecord.aggregate([
      {
        $match: {
          organizationId,
          $expr: {
            $in: [{ $dateToString: { format: '%Y-%m-%d', date: '$date' } }, priorDates],
          },
        },
      },
      { $group: { _id: '$sku', revenue: { $sum: '$revenue' } } },
    ]),
  ]);

  const priorMap = new Map(priorSkus.map((s: any) => [s._id, s.revenue as number]));

  return recentSkus
    .map((s: any) => {
      const prior = priorMap.get(s._id) ?? 0;
      const delta = prior > 0 ? ((s.revenue - prior) / prior) * 100 : 0;
      return { sku: s._id as string, delta, lostRevenue: prior - s.revenue };
    })
    .filter((s) => s.delta < 0)
    .sort((a, b) => a.delta - b.delta);
}

function formatNum(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}
