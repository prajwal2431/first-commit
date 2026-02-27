import { RankedRootCause } from './rootCauseRanker';
import { TestedHypothesis } from './hypothesisTester';
import { AnalysisResultData } from '../../models/AnalysisSession';

const ACTION_MAP: Record<string, Array<{
  type: string;
  titleTemplate: string;
  descriptionTemplate: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  effort: string;
  owner: string;
}>> = {
  H1: [
    {
      type: 'replenish_inventory',
      titleTemplate: 'Express Inventory Allocation',
      descriptionTemplate: 'Transfer {{units}} units from {{origin}} to {{destination}} via express shipping',
      priority: 'urgent',
      effort: '₹12-15K shipping cost, 24-48hr execution',
      owner: 'Supply Chain Manager',
    },
    {
      type: 'investigate_sku_listing',
      titleTemplate: 'Enable "Notify Me" for OOS SKUs',
      descriptionTemplate: 'Activate back-in-stock notifications for {{skus}} to retain customer interest',
      priority: 'high',
      effort: '2-4 hours, no cost',
      owner: 'E-commerce Manager',
    },
  ],
  H2: [
    {
      type: 'investigate_sku_listing',
      titleTemplate: 'Investigate Traffic Channel Drop',
      descriptionTemplate: 'Audit {{channel}} performance, check for listing suppression, bid changes, or algorithm updates',
      priority: 'high',
      effort: '4-8 hours analysis',
      owner: 'Growth/Marketing Lead',
    },
    {
      type: 'investigate_sku_listing',
      titleTemplate: 'Reallocate Ad Spend',
      descriptionTemplate: 'Shift budget from underperforming to high-CVR channels',
      priority: 'medium',
      effort: '2-4 hours, budget neutral',
      owner: 'Performance Marketing',
    },
  ],
  H3: [
    {
      type: 'investigate_sku_listing',
      titleTemplate: 'Review Pricing Strategy',
      descriptionTemplate: 'AOV shifted {{delta}}, investigate if pricing changes or discount removal caused the impact',
      priority: 'medium',
      effort: '2-4 hours analysis',
      owner: 'Category Manager',
    },
  ],
  H4: [
    {
      type: 'investigate_sku_listing',
      titleTemplate: 'Fix Conversion Bottleneck',
      descriptionTemplate: 'CVR dropped while traffic is stable. Check listing quality, pricing, reviews, and checkout flow',
      priority: 'urgent',
      effort: '4-8 hours audit + fix',
      owner: 'E-commerce Manager',
    },
  ],
  H5: [
    {
      type: 'escalate_ops_issue',
      titleTemplate: 'Escalate Delivery SLA',
      descriptionTemplate: 'SLA adherence at {{sla}}%. Escalate with {{carrier}} and consider backup carrier for {{region}}',
      priority: 'urgent',
      effort: '1-2 hours escalation',
      owner: 'Operations Head',
    },
  ],
  H6: [
    {
      type: 'escalate_ops_issue',
      titleTemplate: 'Reduce Returns',
      descriptionTemplate: 'Return rate at {{rate}}%. Audit top-returned SKUs for quality/sizing issues, improve listing accuracy',
      priority: 'high',
      effort: '1-2 days investigation',
      owner: 'Quality / Product Team',
    },
  ],
  H7: [
    {
      type: 'replenish_inventory',
      titleTemplate: 'Pre-position Festival Inventory',
      descriptionTemplate: '{{festival}} active. Ensure high-demand SKUs stocked in key regions ahead of peak',
      priority: 'high',
      effort: '1-2 days, logistics cost varies',
      owner: 'Supply Chain Manager',
    },
  ],
  H8: [
    {
      type: 'replenish_inventory',
      titleTemplate: 'Weather-driven Stock Rebalance',
      descriptionTemplate: 'Temperature shift of {{temp}}°C. Stock weather-relevant categories in affected regions',
      priority: 'medium',
      effort: '1-2 days planning',
      owner: 'Category Manager',
    },
  ],
};

export function generateActions(
  rootCauses: RankedRootCause[],
  testedHypotheses: TestedHypothesis[]
): AnalysisResultData['actions'] {
  const actions: AnalysisResultData['actions'] = [];
  let actionIndex = 0;

  for (const rc of rootCauses) {
    const templateId = rc.id.split('-')[1];
    const templates = ACTION_MAP[templateId];
    if (!templates) continue;

    const hypothesis = testedHypotheses.find((h) => h.templateId === templateId);

    for (const template of templates) {
      let description = template.descriptionTemplate;
      let impactRange = '';

      if (hypothesis) {
        const impact = hypothesis.impactEstimate;
        description = description
          .replace('{{units}}', impact.affectedSkus.length > 0 ? '500' : '100')
          .replace('{{origin}}', impact.affectedRegions.length > 1 ? impact.affectedRegions[1] : 'HQ Warehouse')
          .replace('{{destination}}', impact.affectedRegions[0] ?? 'Target Region')
          .replace('{{skus}}', impact.affectedSkus.join(', ') || 'affected SKUs')
          .replace('{{channel}}', 'primary traffic channel')
          .replace('{{delta}}', `${rc.contribution}%`)
          .replace('{{sla}}', `${rc.confidence * 100}`)
          .replace('{{carrier}}', 'primary carrier')
          .replace('{{region}}', impact.affectedRegions[0] ?? 'affected region')
          .replace('{{rate}}', `${rc.contribution}`)
          .replace('{{festival}}', rc.contributingFactors[0] ?? 'Festival')
          .replace('{{temp}}', rc.contributingFactors[0]?.match(/(\d+)/)?.[1] ?? '5');

        if (impact.lostRevenue > 0) {
          const low = Math.round(impact.lostRevenue * 0.4);
          const high = Math.round(impact.lostRevenue * 0.8);
          impactRange = `₹${formatNum(low)} - ₹${formatNum(high)} revenue recovery`;
        } else {
          impactRange = `${Math.round(rc.contribution * 0.5)}-${rc.contribution}% improvement expected`;
        }
      }

      actions.push({
        id: `action-${++actionIndex}`,
        title: template.titleTemplate,
        description,
        priority: template.priority,
        effort: template.effort,
        expectedImpact: impactRange || `~${rc.contribution}% revenue improvement`,
        owner: template.owner,
        type: template.type,
      });
    }
  }

  return actions;
}

function formatNum(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}
