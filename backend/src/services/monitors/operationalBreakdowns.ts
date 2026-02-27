import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { RetailRecord } from '../../models/RetailRecord';
import { LiveSignal } from '../../models/DashboardState';
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

export async function computeOperationalBreakdowns(organizationId: string): Promise<OperationalBreakdownsResult> {
  const fulfilmentData = await FulfilmentRecord.find({ organizationId })
    .sort({ dispatch_date: -1 })
    .lean();

  if (fulfilmentData.length === 0) {
    return computeFromRetailReturns(organizationId);
  }

  const signals: LiveSignal[] = [];

  const totalShipments = fulfilmentData.length;
  const delivered = fulfilmentData.filter((r) => r.status === 'delivered');
  const returned = fulfilmentData.filter((r) => r.status === 'rto' || r.status === 'returned');
  const cancelled = fulfilmentData.filter((r) => r.status === 'cancelled');
  const delayed = fulfilmentData.filter((r) => r.delay_days > 0);

  const returnRate = totalShipments > 0 ? (returned.length / totalShipments) * 100 : 0;
  const cancelRate = totalShipments > 0 ? (cancelled.length / totalShipments) * 100 : 0;
  const slaAdherence = totalShipments > 0
    ? ((totalShipments - delayed.length) / totalShipments) * 100
    : 100;

  const latestDate = fulfilmentData.length > 0 ? new Date(fulfilmentData[0].dispatch_date) : new Date();
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

  if (returnRate > 5) {
    const carrierBreakdown = new Map<string, number>();
    for (const r of returned) {
      carrierBreakdown.set(r.carrier, (carrierBreakdown.get(r.carrier) ?? 0) + 1);
    }
    const worstCarrier = Array.from(carrierBreakdown.entries())
      .sort((a, b) => b[1] - a[1])[0];

    signals.push({
      id: crypto.randomUUID(),
      severity: returnRate > 15 ? 'critical' : 'high',
      monitorType: 'operations',
      title: `Return rate spike: ${returnRate.toFixed(1)}%`,
      description: worstCarrier
        ? `${returned.length} returns, highest via ${worstCarrier[0]} (${worstCarrier[1]} returns)`
        : `${returned.length} total returns detected`,
      suggestedQuery: 'What is causing the high return rate?',
      evidenceSnippet: `Return rate: ${returnRate.toFixed(1)}% (${returned.length}/${totalShipments})`,
      detectedAt: new Date(),
    });
  }

  if (slaAdherence < 90) {
    signals.push({
      id: crypto.randomUUID(),
      severity: slaAdherence < 80 ? 'critical' : 'high',
      monitorType: 'operations',
      title: `SLA adherence drop: ${slaAdherence.toFixed(1)}%`,
      description: `${delayed.length} shipments exceeded expected delivery time`,
      suggestedQuery: 'Which carriers or regions are causing delivery delays?',
      evidenceSnippet: `SLA adherence at ${slaAdherence.toFixed(1)}%, ${delayed.length} delayed shipments`,
      detectedAt: new Date(),
    });
  }

  if (cancelRate > 3) {
    signals.push({
      id: crypto.randomUUID(),
      severity: cancelRate > 10 ? 'high' : 'medium',
      monitorType: 'operations',
      title: `Cancellation spike: ${cancelRate.toFixed(1)}%`,
      description: `${cancelled.length} orders cancelled`,
      suggestedQuery: 'Why are cancellations increasing?',
      evidenceSnippet: `Cancel rate: ${cancelRate.toFixed(1)}% (${cancelled.length}/${totalShipments})`,
      detectedAt: new Date(),
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

async function computeFromRetailReturns(organizationId: string): Promise<OperationalBreakdownsResult> {
  const signals: LiveSignal[] = [];

  const retailData = await RetailRecord.find({ organizationId })
    .sort({ date: -1 })
    .lean();

  if (retailData.length === 0) {
    return { signals, kpis: { returnRate: 0, returnDelta: 0, slaAdherence: 100, slaDelta: 0 } };
  }

  const totalUnits = retailData.reduce((s, r) => s + r.units, 0);
  const totalReturns = retailData.reduce((s, r) => s + r.returns, 0);
  const returnRate = totalUnits > 0 ? (totalReturns / totalUnits) * 100 : 0;

  if (returnRate > 5) {
    signals.push({
      id: crypto.randomUUID(),
      severity: returnRate > 15 ? 'critical' : returnRate > 8 ? 'high' : 'medium',
      monitorType: 'operations',
      title: `Return rate: ${returnRate.toFixed(1)}%`,
      description: `${totalReturns} returns out of ${totalUnits} units sold`,
      suggestedQuery: 'What is driving the return rate?',
      evidenceSnippet: `Overall return rate: ${returnRate.toFixed(1)}%`,
      detectedAt: new Date(),
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
