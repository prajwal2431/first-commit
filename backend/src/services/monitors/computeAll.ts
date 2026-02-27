import { computeRevenueAtRisk } from './revenueAtRisk';
import { computeInventoryExposure } from './inventoryExposure';
import { computeOperationalBreakdowns } from './operationalBreakdowns';
import { computeDemandSpikes } from './demandSpikes';
import { DashboardState, LiveSignal, KpiSummary, RevenueSeriesPoint } from '../../models/DashboardState';

export async function computeAllMonitors(organizationId: string): Promise<void> {
  console.log(`[monitors] Recomputing all monitors for org=${organizationId}`);
  const start = Date.now();

  const [revenue, inventory, ops, demand] = await Promise.all([
    computeRevenueAtRisk(organizationId),
    computeInventoryExposure(organizationId),
    computeOperationalBreakdowns(organizationId),
    computeDemandSpikes(organizationId),
  ]);

  const liveSignals: LiveSignal[] = [
    ...revenue.signals,
    ...inventory.signals,
    ...ops.signals,
    ...demand.signals,
  ];

  const kpiSummary: KpiSummary = {
    totalRevenue: revenue.kpis.totalRevenue,
    revenueDelta: revenue.kpis.revenueDelta,
    revenueDeltaPercent: revenue.kpis.revenueDeltaPercent,
    totalOrders: revenue.kpis.totalOrders,
    ordersDelta: revenue.kpis.ordersDelta,
    avgOrderValue: revenue.kpis.avgOrderValue,
    aovDelta: revenue.kpis.aovDelta,
    oosRate: inventory.kpis.oosRate,
    oosDelta: inventory.kpis.oosDelta,
    returnRate: ops.kpis.returnRate,
    returnDelta: ops.kpis.returnDelta,
    slaAdherence: ops.kpis.slaAdherence,
    slaDelta: ops.kpis.slaDelta,
  };

  await DashboardState.findOneAndUpdate(
    { organizationId },
    {
      organizationId,
      revenueAtRiskSeries: revenue.series,
      liveSignals,
      kpiSummary,
      lastComputedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  console.log(`[monitors] Recompute done in ${Date.now() - start}ms, ${liveSignals.length} signals`);
}
