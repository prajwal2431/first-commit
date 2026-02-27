import { TestedHypothesis } from './hypothesisTester';
import { AnalysisResultData } from '../../models/AnalysisSession';

export interface RankedRootCause {
  id: string;
  title: string;
  description: string;
  contribution: number;
  confidence: number;
  monitorType: string;
  contributingFactors: string[];
  evidence: Record<string, unknown>;
}

const MONITOR_MAP: Record<string, string> = {
  H1: 'inventory',
  H2: 'revenue',
  H3: 'revenue',
  H4: 'revenue',
  H5: 'operations',
  H6: 'operations',
  H7: 'demand',
  H8: 'demand',
};

export function rankRootCauses(testedHypotheses: TestedHypothesis[]): RankedRootCause[] {
  const confirmed = testedHypotheses.filter(
    (h) => h.status === 'confirmed' || (h.status === 'inconclusive' && h.confidenceScore > 0.3)
  );

  if (confirmed.length === 0) return [];

  const totalScore = confirmed.reduce(
    (s, h) => s + h.confidenceScore * h.contribution,
    0
  );

  return confirmed
    .sort((a, b) => {
      const scoreA = a.confidenceScore * a.contribution;
      const scoreB = b.confidenceScore * b.contribution;
      return scoreB - scoreA;
    })
    .map((h, i) => ({
      id: `rc-${h.templateId}-${i}`,
      title: h.name,
      description: buildDescription(h),
      contribution: totalScore > 0
        ? Math.round(((h.confidenceScore * h.contribution) / totalScore) * 100)
        : Math.round((1 / confirmed.length) * 100),
      confidence: Math.round(h.confidenceScore * 100) / 100,
      monitorType: MONITOR_MAP[h.templateId] ?? 'revenue',
      contributingFactors: h.contributingFactors,
      evidence: {
        tests: h.evidence,
        impact: h.impactEstimate,
      },
    }));
}

function buildDescription(h: TestedHypothesis): string {
  const supportingEvidence = h.evidence.filter((e) => e.supports);
  if (supportingEvidence.length === 0) return h.description;

  const topEvidence = supportingEvidence[0];
  return `${h.description}. ${topEvidence.result}`;
}

export function computeBusinessImpact(
  rootCauses: RankedRootCause[],
  testedHypotheses: TestedHypothesis[]
): AnalysisResultData['businessImpact'] {
  let totalLostRevenue = 0;
  let totalOosSkus = 0;
  let conversionDrop = 0;
  let slaBreaches = 0;
  let stockAtHQ = 0;
  let stockAtTarget = 0;

  for (const h of testedHypotheses) {
    if (h.status !== 'confirmed') continue;
    totalLostRevenue += h.impactEstimate.lostRevenue;
    if (h.templateId === 'H1') {
      totalOosSkus += h.impactEstimate.affectedSkus.length;
      const stockEvidence = h.evidence.find((e) => e.query.includes('other locations'));
      if (stockEvidence) {
        const match = stockEvidence.result.match(/(\d+)\s*units/);
        if (match) stockAtHQ = parseInt(match[1]);
      }
    }
    if (h.templateId === 'H4') {
      const cvrEvidence = h.evidence.find((e) => e.query.includes('CVR'));
      if (cvrEvidence) {
        const match = cvrEvidence.result.match(/([\d.]+)%/);
        if (match) conversionDrop = parseFloat(match[1]);
      }
    }
    if (h.templateId === 'H5') {
      const slaEvidence = h.evidence.find((e) => e.query.includes('SLA'));
      if (slaEvidence) {
        const match = slaEvidence.result.match(/(\d+)\/\d+ delayed/);
        if (match) slaBreaches = parseInt(match[1]);
      }
    }
  }

  const formatRevenue = (n: number): string => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n}`;
  };

  return {
    lostRevenue: totalLostRevenue,
    lostRevenueFormatted: formatRevenue(totalLostRevenue),
    conversionDrop,
    oosSkus: totalOosSkus,
    slaBreaches,
    stockAtHQ,
    stockAtTarget,
  };
}

export function computeGeoOpportunity(
  testedHypotheses: TestedHypothesis[]
): AnalysisResultData['geoOpportunity'] {
  const stockoutHyp = testedHypotheses.find(
    (h) => h.templateId === 'H1' && h.status === 'confirmed'
  );

  if (!stockoutHyp) return null;

  const affectedRegions = stockoutHyp.impactEstimate.affectedRegions;
  const stockElsewhereEvidence = stockoutHyp.evidence.find(
    (e) => e.query.includes('other locations')
  );

  if (!stockElsewhereEvidence || affectedRegions.length === 0) return null;

  const stockLocations = stockElsewhereEvidence.result.match(/at (\w[\w-]*)/g);
  const origin = stockLocations?.[0]?.replace('at ', '') ?? 'HQ Warehouse';

  return {
    origin,
    originLabel: `${origin} - Overstock`,
    destination: affectedRegions[0],
    destinationLabel: `${affectedRegions[0]} - Stockout`,
    narrative: `Demand concentrated in ${affectedRegions.join(', ')} but inventory trapped at ${origin}. Recommend express transfer to capture blocked revenue.`,
  };
}
