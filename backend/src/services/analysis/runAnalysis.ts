import type { AnalysisResultData, AnalysisStep } from '../../models/AnalysisSession';
import { getAnalysisSession, updateAnalysisSession } from '../../db/analysisSessionRepo';
import { countRetailByOrg, listRetailByOrg } from '../../db/retailRecordRepo';
import { countOrdersByOrg } from '../../db/orderRepo';
import { countInventoryByOrg } from '../../db/inventoryRepo';
import { countFulfilmentByOrg } from '../../db/fulfilmentRecordRepo';
import { countTrafficByOrg } from '../../db/trafficRecordRepo';
import { countWeatherByOrg } from '../../db/weatherRecordRepo';
import { detectAnomalies } from './anomalyDetector';
import { getApplicableHypotheses } from './hypothesisLibrary';
import { testHypotheses } from './hypothesisTester';
import { rankRootCauses, computeBusinessImpact, computeGeoOpportunity } from './rootCauseRanker';
import { generateActions } from './actionGenerator';
import { generateMemo } from './narrator';

export type ProgressCallback = (step: AnalysisStep) => void;

export async function runFullAnalysis(
  sessionId: string,
  organizationId: string,
  onProgress?: ProgressCallback
): Promise<AnalysisResultData> {
  const session = await getAnalysisSession(organizationId, sessionId);
  if (!session) throw new Error('Analysis session not found');

  const steps: AnalysisStep[] = [
    { stage: 1, label: 'Querying data sources', status: 'pending' },
    { stage: 2, label: 'Detecting anomalies & analyzing signals', status: 'pending' },
    { stage: 3, label: 'Testing hypotheses & correlating evidence', status: 'pending' },
    { stage: 4, label: 'Generating action plan & memo', status: 'pending' },
  ];
  await updateAnalysisSession(organizationId, sessionId, { status: 'running', steps });

  const sessionRef = { ...session, steps, status: 'running' as const };

  try {
    updateStep(sessionRef, 0, 'running', onProgress);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    const [retailCount, orderCount, invCount, fulCount, trafficCount, weatherCount] = await Promise.all([
      countRetailByOrg(organizationId),
      countOrdersByOrg(organizationId),
      countInventoryByOrg(organizationId),
      countFulfilmentByOrg(organizationId),
      countTrafficByOrg(organizationId),
      countWeatherByOrg(organizationId),
    ]);

    const availableData = new Set<string>();
    if (retailCount > 0) availableData.add('retail');
    if (orderCount > 0) availableData.add('orders');
    if (invCount > 0) availableData.add('inventory');
    if (fulCount > 0) availableData.add('fulfilment');
    if (trafficCount > 0) availableData.add('traffic');
    if (weatherCount > 0) availableData.add('weather');

    const detail = `Found: ${Array.from(availableData).join(', ')} (${retailCount + orderCount + invCount + fulCount + trafficCount + weatherCount} total records)`;
    updateStep(sessionRef, 0, 'completed', onProgress, detail);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    updateStep(sessionRef, 1, 'running', onProgress);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    const anomalies = await detectAnomalies(organizationId);
    updateStep(sessionRef, 1, 'completed', onProgress, `${anomalies.length} anomalies detected`);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    updateStep(sessionRef, 2, 'running', onProgress);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    const applicableHypotheses = getApplicableHypotheses(anomalies, availableData);
    const testedHypotheses = await testHypotheses(organizationId, applicableHypotheses, anomalies);
    const confirmedCount = testedHypotheses.filter((h) => h.status === 'confirmed').length;
    updateStep(sessionRef, 2, 'completed', onProgress,
      `Tested ${applicableHypotheses.length} hypotheses, ${confirmedCount} confirmed`);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    updateStep(sessionRef, 3, 'running', onProgress);
    await updateAnalysisSession(organizationId, sessionId, { steps: sessionRef.steps });

    const rootCauses = rankRootCauses(testedHypotheses);
    const businessImpact = computeBusinessImpact(rootCauses, testedHypotheses);
    const geoOpportunity = computeGeoOpportunity(testedHypotheses);
    const actions = generateActions(rootCauses, testedHypotheses);

    const retailData = await listRetailByOrg(organizationId);
    const dailyMap = new Map<string, { revenue: number; traffic: number }>();
    for (const r of retailData) {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const ex = dailyMap.get(key) ?? { revenue: 0, traffic: 0 };
      ex.revenue += r.revenue;
      ex.traffic += r.traffic;
      dailyMap.set(key, ex);
    }
    const revSeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_id, d]) => ({ _id, revenue: d.revenue, traffic: d.traffic }));

    const charts: AnalysisResultData['charts'] = {
      revenueVsTraffic: revSeries.map((d) => ({
        date: d._id,
        revenue: d.revenue,
        traffic: d.traffic,
      })),
      externalFactors: [],
    };

    const partialResult = {
      rootCauses,
      businessImpact,
      actions,
      geoOpportunity,
      charts,
    };

    const memoMarkdown = generateMemo(partialResult);

    const result: AnalysisResultData = {
      ...partialResult,
      memoMarkdown,
    };

    updateStep(sessionRef, 3, 'completed', onProgress,
      `${rootCauses.length} root causes, ${actions.length} actions generated`);

    await updateAnalysisSession(organizationId, sessionId, {
      status: 'completed',
      steps: sessionRef.steps,
      result,
      completedAt: new Date().toISOString(),
    });

    return result;
  } catch (err) {
    await updateAnalysisSession(organizationId, sessionId, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Analysis failed',
    });
    throw err;
  }
}

function updateStep(
  session: { steps: AnalysisStep[] },
  index: number,
  status: AnalysisStep['status'],
  onProgress?: ProgressCallback,
  detail?: string
): void {
  if (!session.steps[index]) return;
  session.steps[index].status = status;
  if (status === 'running') session.steps[index].startedAt = new Date().toISOString();
  if (status === 'completed') session.steps[index].completedAt = new Date().toISOString();
  if (detail) session.steps[index].detail = detail;
  if (onProgress) onProgress(session.steps[index]);
}
