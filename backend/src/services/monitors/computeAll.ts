import { computeRevenueAtRisk } from './revenueAtRisk';
import { computeInventoryExposure } from './inventoryExposure';
import { computeOperationalBreakdowns } from './operationalBreakdowns';
import { computeDemandSpikes } from './demandSpikes';
import { getOrgSettings } from '../../db/orgSettingsRepo';
import { getDashboardState, putDashboardState } from '../../db/dashboardStateRepo';
import type { LiveSignal, KpiSummary } from '../../models/DashboardState';
import { DEFAULT_THRESHOLDS, type SignalThresholds } from '../../models/OrgSettings';

function generateLogicalAIPrediction(kpiSummary: any, liveSignals: any[]): string {
  // Temporary mock for real AI model predictions using actual backend logic
  const rarTotal = kpiSummary.revenueAtRiskTotal || 0;
  const isNegative = (kpiSummary.revenueDeltaPercent || 0) < 0;

  if (rarTotal > 0) {
    const criticalSignals = liveSignals.filter(s => s.severity === 'critical');
    const primaryFactor = criticalSignals.length > 0 ? criticalSignals[0].title.toLowerCase() : 'multiple concurrent factors';
    return `₹${rarTotal.toLocaleString('en-IN')} revenue at risk detected. Primary driver: ${primaryFactor}. The system recommends cross-referencing conversion metrics and deploying immediate corrective measures.`;
  } else if (isNegative) {
    return "Revenue trend shows sustained decline compared to baseline. Expected structural weakness in current channel strategies. Re-allocating budget to high-performing drivers is recommended.";
  } else {
    return "Operations and revenue are trending positively. The current trajectory indicates continuous growth. Maintain current stock health levels for peak seasonal demands.";
  }
}

export async function computeAllMonitors(organizationId: string): Promise<void> {
  console.log(`[monitors] Recomputing all monitors for org=${organizationId}`);
  const start = Date.now();

  let thresholds: SignalThresholds = { ...DEFAULT_THRESHOLDS };
  try {
    const settings = await getOrgSettings(organizationId);
    if (settings?.thresholds) {
      thresholds = {
        ...DEFAULT_THRESHOLDS,
        ...settings.thresholds,
        trafficUpCvrDown: {
          ...DEFAULT_THRESHOLDS.trafficUpCvrDown,
          ...(settings.thresholds as SignalThresholds).trafficUpCvrDown,
        },
      };
    }
  } catch (err) {
    console.warn('[monitors] Could not load org thresholds, using defaults:', err);
  }

  const [revenue, inventory, ops, demand] = await Promise.all([
    computeRevenueAtRisk(organizationId, thresholds),
    computeInventoryExposure(organizationId, thresholds),
    computeOperationalBreakdowns(organizationId, thresholds),
    computeDemandSpikes(organizationId, thresholds),
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
    revenueAtRiskTotal: revenue.kpis.revenueAtRiskTotal,
    rarDecomposition: revenue.kpis.rarDecomposition,
  };

  kpiSummary.aiPrediction = generateLogicalAIPrediction(kpiSummary, liveSignals);

  const existing = await getDashboardState(organizationId);
  await putDashboardState({
    organizationId,
    sk: 'STATE',
    revenueAtRiskSeries: revenue.series,
    liveSignals,
    kpiSummary,
    lastComputedAt: new Date().toISOString(),
    resolvedSignalIds: existing?.resolvedSignalIds ?? [],
  });

  console.log(`[monitors] Recompute done in ${Date.now() - start}ms, ${liveSignals.length} signals`);
}
