import { listFulfilmentByOrg } from '../../db/fulfilmentRecordRepo';
import { listRetailByOrg } from '../../db/retailRecordRepo';
import type { LiveSignal } from '../../models/DashboardState';
import type { SignalThresholds } from '../../models/OrgSettings';
import crypto from 'crypto';

interface OpsKpis {
  returnRate: number;
  returnDelta: number;
  slaAdherence: number;
  slaDelta: number;
}

export interface OperationalBreakdownsResult {
  signals: LiveSignal[];
  kpis: OpsKpis;
}

export async function computeOperationalBreakdowns(
  organizationId: string,
  thresholds: SignalThresholds
): Promise<OperationalBreakdownsResult> {
  const fulfilmentData = await listFulfilmentByOrg(organizationId);

  if (fulfilmentData.length === 0) {
    return computeFromRetailReturns(organizationId, thresholds);
  }

  const signals: LiveSignal[] = [];

  const totalShipments = fulfilmentData.length;
  const delivered = fulfilmentData.filter((r) => r.status === 'delivered');
  const returned = fulfilmentData.filter((r) => r.status === 'rto' || r.status === 'returned');
  const cancelled = fulfilmentData.filter((r) => r.status === 'cancelled');
  const delayed = fulfilmentData.filter((r) => r.delay_days > 0);
  const rtoOnly = fulfilmentData.filter((r) => r.status === 'rto');

  const returnRate = totalShipments > 0 ? (returned.length / totalShipments) * 100 : 0;
  const cancelRate = totalShipments > 0 ? (cancelled.length / totalShipments) * 100 : 0;
  const rtoRate = totalShipments > 0 ? (rtoOnly.length / totalShipments) * 100 : 0;
  const slaAdherence = totalShipments > 0
    ? ((totalShipments - delayed.length) / totalShipments) * 100
    : 100;

  const latestDate = fulfilmentData.length > 0 ? new Date(fulfilmentData[0].dispatch_date as string) : new Date();
  const midpoint = new Date(latestDate.getTime() - 7 * 86400000);
  const recentData = fulfilmentData.filter((r) => new Date(r.dispatch_date) >= midpoint);
  const priorData = fulfilmentData.filter((r) => new Date(r.dispatch_date) < midpoint);

  const recentReturns = recentData.filter((r) => r.status === 'rto' || r.status === 'returned').length;
  const priorReturns = priorData.filter((r) => r.status === 'rto' || r.status === 'returned').length;
  const recentReturnRate = recentData.length > 0 ? (recentReturns / recentData.length) * 100 : 0;
  const priorReturnRate = priorData.length > 0 ? (priorReturns / priorData.length) * 100 : 0;

  const recentDelayed = recentData.filter((r) => r.delay_days > 0).length;
  const priorDelayed = priorData.filter((r) => r.delay_days > 0).length;
  const recentSla = recentData.length > 0
    ? ((recentData.length - recentDelayed) / recentData.length) * 100
    : 100;
  const priorSla = priorData.length > 0
    ? ((priorData.length - priorDelayed) / priorData.length) * 100
    : 100;

  // ─── Signal 1: Return rate spike ────────────────────────────────────
  if (returnRate > thresholds.returnRateWarning) {
    const carrierBreakdown = new Map<string, number>();
    for (const r of returned) {
      carrierBreakdown.set(r.carrier, (carrierBreakdown.get(r.carrier) ?? 0) + 1);
    }
    const worstCarrier = Array.from(carrierBreakdown.entries())
      .sort((a, b) => b[1] - a[1])[0];

    // Estimate margin at risk from returns (returns cost ~30% of item value on average)
    const avgShipmentValue = totalShipments > 0 ? 500 : 0; // approx
    const marginAtRisk = Math.round(returned.length * avgShipmentValue * 0.3);

    signals.push({
      id: crypto.randomUUID(),
      severity: returnRate > thresholds.returnRateCritical ? 'critical' : 'high',
      monitorType: 'operations',
      title: `Return rate spike: ${returnRate.toFixed(1)}%`,
      description: worstCarrier
        ? `${returned.length} returns, highest via ${worstCarrier[0]} (${worstCarrier[1]} returns)`
        : `${returned.length} total returns detected`,
      suggestedQuery: 'What is causing the high return rate?',
      evidenceSnippet: `Return rate: ${returnRate.toFixed(1)}% (${returned.length}/${totalShipments})`,
      detectedAt: new Date().toISOString(),
      impact: {
        marginAtRisk,
        ordersAtRisk: returned.length,
        confidence: computeOpsConfidence(totalShipments, true),
        drivers: buildReturnDrivers(worstCarrier),
      },
    });
  }

  // ─── Signal 2: SLA adherence drop ───────────────────────────────────
  if (slaAdherence < thresholds.slaAdherenceWarning) {
    signals.push({
      id: crypto.randomUUID(),
      severity: slaAdherence < thresholds.slaAdherenceCritical ? 'critical' : 'high',
      monitorType: 'operations',
      title: `SLA adherence drop: ${slaAdherence.toFixed(1)}%`,
      description: `${delayed.length} shipments exceeded expected delivery time`,
      suggestedQuery: 'Which carriers or regions are causing delivery delays?',
      evidenceSnippet: `SLA adherence at ${slaAdherence.toFixed(1)}%, ${delayed.length} delayed shipments`,
      detectedAt: new Date().toISOString(),
      impact: {
        ordersAtRisk: delayed.length,
        confidence: computeOpsConfidence(totalShipments, true),
        drivers: [
          { driver: 'Carrier SLA violation', contribution: 55 },
          { driver: 'Regional logistics bottleneck', contribution: 30 },
          { driver: 'Warehouse processing delays', contribution: 15 },
        ],
      },
    });
  }

  // ─── Signal 3: Cancellation spike ───────────────────────────────────
  if (cancelRate > thresholds.cancelRateWarning) {
    signals.push({
      id: crypto.randomUUID(),
      severity: cancelRate > thresholds.cancelRateCritical ? 'high' : 'medium',
      monitorType: 'operations',
      title: `Cancellation spike: ${cancelRate.toFixed(1)}%`,
      description: `${cancelled.length} orders cancelled`,
      suggestedQuery: 'Why are cancellations increasing?',
      evidenceSnippet: `Cancel rate: ${cancelRate.toFixed(1)}% (${cancelled.length}/${totalShipments})`,
      detectedAt: new Date().toISOString(),
      impact: {
        ordersAtRisk: cancelled.length,
        confidence: computeOpsConfidence(totalShipments, false),
        drivers: [
          { driver: 'Pre-delivery customer cancellation', contribution: 45 },
          { driver: 'Delayed processing window', contribution: 35 },
          { driver: 'Payment/COD issues', contribution: 20 },
        ],
      },
    });
  }

  // ─── Signal 4: RTO spike (India-specific) ───────────────────────────
  if (rtoRate > thresholds.rtoRateWarning) {
    // Regional RTO breakdown
    const regionRto = new Map<string, { total: number; rto: number }>();
    for (const r of fulfilmentData) {
      const key = r.region || 'Unknown';
      const ex = regionRto.get(key) ?? { total: 0, rto: 0 };
      ex.total++;
      if (r.status === 'rto') ex.rto++;
      regionRto.set(key, ex);
    }
    const worstRegion = Array.from(regionRto.entries())
      .map(([region, d]) => ({ region, rtoRate: d.total > 0 ? (d.rto / d.total) * 100 : 0 }))
      .sort((a, b) => b.rtoRate - a.rtoRate)[0];

    signals.push({
      id: crypto.randomUUID(),
      severity: rtoRate > thresholds.rtoRateCritical ? 'critical' : 'high',
      monitorType: 'operations',
      title: `RTO spike: ${rtoRate.toFixed(1)}%`,
      description: `${rtoOnly.length} orders returned to origin${worstRegion ? `. Worst: ${worstRegion.region} (${worstRegion.rtoRate.toFixed(0)}%)` : ''}`,
      suggestedQuery: 'What is driving the high RTO rate?',
      evidenceSnippet: `RTO rate: ${rtoRate.toFixed(1)}% (${rtoOnly.length}/${totalShipments})`,
      detectedAt: new Date().toISOString(),
      impact: {
        ordersAtRisk: rtoOnly.length,
        marginAtRisk: Math.round(rtoOnly.length * 300), // avg RTO cost
        confidence: computeOpsConfidence(totalShipments, true),
        drivers: [
          { driver: 'Customer unavailability', contribution: 40 },
          { driver: 'Address quality issues', contribution: 30 },
          { driver: 'COD refusal', contribution: 20 },
          { driver: 'Carrier delivery attempts', contribution: 10 },
        ],
      },
    });
  }

  return {
    signals,
    kpis: {
      returnRate: Math.round(returnRate * 10) / 10,
      returnDelta: Math.round((recentReturnRate - priorReturnRate) * 10) / 10,
      slaAdherence: Math.round(slaAdherence * 10) / 10,
      slaDelta: Math.round((recentSla - priorSla) * 10) / 10,
    },
  };
}

async function computeFromRetailReturns(
  organizationId: string,
  thresholds: SignalThresholds
): Promise<OperationalBreakdownsResult> {
  const signals: LiveSignal[] = [];

  const retailData = await listRetailByOrg(organizationId);

  if (retailData.length === 0) {
    return { signals, kpis: { returnRate: 0, returnDelta: 0, slaAdherence: 100, slaDelta: 0 } };
  }

  const totalUnits = retailData.reduce((s, r) => s + r.units, 0);
  const totalReturns = retailData.reduce((s, r) => s + r.returns, 0);
  const returnRate = totalUnits > 0 ? (totalReturns / totalUnits) * 100 : 0;

  if (returnRate > thresholds.returnRateWarning) {
    signals.push({
      id: crypto.randomUUID(),
      severity: returnRate > thresholds.returnRateCritical ? 'critical' : returnRate > (thresholds.returnRateWarning * 1.5) ? 'high' : 'medium',
      monitorType: 'operations',
      title: `Return rate: ${returnRate.toFixed(1)}%`,
      description: `${totalReturns} returns out of ${totalUnits} units sold`,
      suggestedQuery: 'What is driving the return rate?',
      evidenceSnippet: `Overall return rate: ${returnRate.toFixed(1)}%`,
      detectedAt: new Date().toISOString(),
      impact: {
        ordersAtRisk: totalReturns,
        confidence: 65,
        drivers: [
          { driver: 'Product quality/expectation gap', contribution: 50 },
          { driver: 'Sizing/fit issues', contribution: 30 },
          { driver: 'Shipping damage', contribution: 20 },
        ],
      },
    });
  }

  return {
    signals,
    kpis: {
      returnRate: Math.round(returnRate * 10) / 10,
      returnDelta: 0,
      slaAdherence: 100,
      slaDelta: 0,
    },
  };
}

function computeOpsConfidence(sampleSize: number, hasCarrierData: boolean): number {
  let confidence = 50;
  if (sampleSize >= 200) confidence += 25;
  else if (sampleSize >= 50) confidence += 15;
  else if (sampleSize >= 20) confidence += 5;
  if (hasCarrierData) confidence += 15;
  return Math.min(confidence, 95);
}

function buildReturnDrivers(worstCarrier?: [string, number]): Array<{ driver: string; contribution: number }> {
  const drivers: Array<{ driver: string; contribution: number }> = [];
  if (worstCarrier) {
    drivers.push({ driver: `Carrier: ${worstCarrier[0]}`, contribution: 40 });
  }
  drivers.push({ driver: 'Product quality/fit issues', contribution: 30 });
  drivers.push({ driver: 'Delivery experience', contribution: 20 });
  drivers.push({ driver: 'Expectation mismatch', contribution: 10 });
  return drivers;
}
