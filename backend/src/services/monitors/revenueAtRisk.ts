import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { LiveSignal, RevenueSeriesPoint } from '../../models/DashboardState';
import crypto from 'crypto';

interface RevenueKpis {
  totalRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number;
  totalOrders: number;
  ordersDelta: number;
  avgOrderValue: number;
  aovDelta: number;
}

export interface RevenueAtRiskResult {
  series: RevenueSeriesPoint[];
  signals: LiveSignal[];
  kpis: RevenueKpis;
}

export async function computeRevenueAtRisk(organizationId: string): Promise<RevenueAtRiskResult> {
  const emptyKpis: RevenueKpis = {
    totalRevenue: 0, revenueDelta: 0, revenueDeltaPercent: 0,
    totalOrders: 0, ordersDelta: 0, avgOrderValue: 0, aovDelta: 0,
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

    const revDelta = priorRevenue > 0
      ? ((recentRevenue - priorRevenue) / priorRevenue) * 100
      : 0;

    if (revDelta < -15) {
      signals.push({
        id: crypto.randomUUID(),
        severity: revDelta < -25 ? 'critical' : 'high',
        monitorType: 'revenue',
        title: `Revenue drop: ${revDelta.toFixed(1)}% WoW`,
        description: `Weekly revenue fell from ₹${formatNum(priorRevenue)} to ₹${formatNum(recentRevenue)}`,
        suggestedQuery: 'Why is revenue dropping this week?',
        evidenceSnippet: `Revenue declined ${Math.abs(revDelta).toFixed(1)}% compared to previous week`,
        detectedAt: new Date(),
      });
    }

    if (recentTraffic > 0 && revDelta < -10) {
      const priorTraffic = priorDays.reduce((s, [, d]) => s + d.traffic, 0);
      const trafficDelta = priorTraffic > 0
        ? ((recentTraffic - priorTraffic) / priorTraffic) * 100
        : 0;
      if (trafficDelta > 10) {
        signals.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          monitorType: 'revenue',
          title: 'Revenue dropping despite high traffic',
          description: `Traffic up ${trafficDelta.toFixed(0)}% but revenue down ${Math.abs(revDelta).toFixed(0)}%`,
          suggestedQuery: 'Why is revenue dropping despite high traffic?',
          evidenceSnippet: `Traffic-revenue gap: traffic +${trafficDelta.toFixed(0)}% vs revenue ${revDelta.toFixed(0)}%`,
          detectedAt: new Date(),
        });
      }
    }

    const last = sortedDays[sortedDays.length - 1][1];
    const prev = sortedDays[sortedDays.length - 2][1];
    const dodDelta = prev.revenue > 0
      ? ((last.revenue - prev.revenue) / prev.revenue) * 100
      : 0;
    if (dodDelta < -10) {
      signals.push({
        id: crypto.randomUUID(),
        severity: dodDelta < -20 ? 'high' : 'medium',
        monitorType: 'revenue',
        title: `Day-over-day revenue drop: ${dodDelta.toFixed(1)}%`,
        description: `Revenue fell from ₹${formatNum(prev.revenue)} to ₹${formatNum(last.revenue)}`,
        suggestedQuery: 'What caused the sudden revenue drop today?',
        evidenceSnippet: `DoD revenue decline of ${Math.abs(dodDelta).toFixed(1)}%`,
        detectedAt: new Date(),
      });
    }

    const totalRevenue = recentRevenue;
    const totalOrders = recentDays.reduce((s, [, d]) => s + d.orders, 0);
    const priorOrders = priorDays.reduce((s, [, d]) => s + d.orders, 0);
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const priorAov = priorOrders > 0 ? priorRevenue / priorOrders : 0;

    const topSkusByRevenue = await getTopSkuContributors(organizationId, recentDays, priorDays);
    if (topSkusByRevenue.length > 0) {
      const worstSku = topSkusByRevenue[0];
      if (worstSku.delta < -20) {
        signals.push({
          id: crypto.randomUUID(),
          severity: 'high',
          monitorType: 'revenue',
          title: `Top SKU revenue drop: ${worstSku.sku}`,
          description: `${worstSku.sku} revenue down ${Math.abs(worstSku.delta).toFixed(0)}%`,
          suggestedQuery: `Why is ${worstSku.sku} revenue dropping?`,
          evidenceSnippet: `SKU ${worstSku.sku} contributed ₹${formatNum(worstSku.lostRevenue)} in lost revenue`,
          detectedAt: new Date(),
        });
      }
    }

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
      },
    };
  }

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
    },
  };
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
