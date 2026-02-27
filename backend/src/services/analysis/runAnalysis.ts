import { AnalysisSession, AnalysisResultData, AnalysisStep } from '../../models/AnalysisSession';
import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { TrafficRecord } from '../../models/TrafficRecord';
import { WeatherRecord } from '../../models/WeatherRecord';
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
  const session = await AnalysisSession.findById(sessionId);
  if (!session) throw new Error('Analysis session not found');

  session.status = 'running';
  session.steps = [
    { stage: 1, label: 'Querying data sources', status: 'pending' },
    { stage: 2, label: 'Detecting anomalies & analyzing signals', status: 'pending' },
    { stage: 3, label: 'Testing hypotheses & correlating evidence', status: 'pending' },
    { stage: 4, label: 'Generating action plan & memo', status: 'pending' },
  ];
  await session.save();

  try {
    updateStep(session, 0, 'running', onProgress);
    await session.save();

    const availableData = new Set<string>();
    const [retailCount, orderCount, invCount, fulCount, trafficCount, weatherCount] = await Promise.all([
      RetailRecord.countDocuments({ organizationId }),
      OrderRecord.countDocuments({ organizationId }),
      InventoryRecord.countDocuments({ organizationId }),
      FulfilmentRecord.countDocuments({ organizationId }),
      TrafficRecord.countDocuments({ organizationId }),
      WeatherRecord.countDocuments({ organizationId }),
    ]);

    if (retailCount > 0) availableData.add('retail');
    if (orderCount > 0) availableData.add('orders');
    if (invCount > 0) availableData.add('inventory');
    if (fulCount > 0) availableData.add('fulfilment');
    if (trafficCount > 0) availableData.add('traffic');
    if (weatherCount > 0) availableData.add('weather');

    const detail = `Found: ${Array.from(availableData).join(', ')} (${retailCount + orderCount + invCount + fulCount + trafficCount + weatherCount} total records)`;
    updateStep(session, 0, 'completed', onProgress, detail);
    await session.save();

    updateStep(session, 1, 'running', onProgress);
    await session.save();

    const anomalies = await detectAnomalies(organizationId);
    updateStep(session, 1, 'completed', onProgress, `${anomalies.length} anomalies detected`);
    await session.save();

    updateStep(session, 2, 'running', onProgress);
    await session.save();

    const applicableHypotheses = getApplicableHypotheses(anomalies, availableData);
    const testedHypotheses = await testHypotheses(organizationId, applicableHypotheses, anomalies);
    const confirmedCount = testedHypotheses.filter((h) => h.status === 'confirmed').length;
    updateStep(session, 2, 'completed', onProgress,
      `Tested ${applicableHypotheses.length} hypotheses, ${confirmedCount} confirmed`);
    await session.save();

    updateStep(session, 3, 'running', onProgress);
    await session.save();

    const rootCauses = rankRootCauses(testedHypotheses);
    const businessImpact = computeBusinessImpact(rootCauses, testedHypotheses);
    const geoOpportunity = computeGeoOpportunity(testedHypotheses);
    const actions = generateActions(rootCauses, testedHypotheses);

    const revSeries = await RetailRecord.aggregate([
      { $match: { organizationId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          revenue: { $sum: '$revenue' },
          traffic: { $sum: '$traffic' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const charts: AnalysisResultData['charts'] = {
      revenueVsTraffic: revSeries.map((d: any) => ({
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

    updateStep(session, 3, 'completed', onProgress,
      `${rootCauses.length} root causes, ${actions.length} actions generated`);

    session.status = 'completed';
    session.result = result;
    session.completedAt = new Date();
    await session.save();

    return result;
  } catch (err) {
    session.status = 'failed';
    session.errorMessage = err instanceof Error ? err.message : 'Analysis failed';
    await session.save();
    throw err;
  }
}

function updateStep(
  session: any,
  index: number,
  status: AnalysisStep['status'],
  onProgress?: ProgressCallback,
  detail?: string
): void {
  if (!session.steps[index]) return;
  session.steps[index].status = status;
  if (status === 'running') session.steps[index].startedAt = new Date();
  if (status === 'completed') session.steps[index].completedAt = new Date();
  if (detail) session.steps[index].detail = detail;
  session.markModified('steps');
  if (onProgress) onProgress(session.steps[index]);
}
