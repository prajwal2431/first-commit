import { Router, Request, Response } from 'express';
import { AnalysisSession } from '../models/AnalysisSession';
import { DashboardState } from '../models/DashboardState';
import { DataSource } from '../models/DataSource';
import { RetailRecord } from '../models/RetailRecord';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';
import { generateChatResponse } from '../services/analysis/narrator';
import { runFullAnalysis } from '../services/analysis/runAnalysis';
import { invokeRCAAgent } from '../services/rca/rcaAgentClient';

const router = Router();

router.post('/message', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { message, sessionId, sheet_url: bodySheetUrl } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Try to find an existing session, or create one if we don't have it
    let session = null;
    if (sessionId) {
      try {
        session = await AnalysisSession.findOne({ _id: sessionId, organizationId: orgId });
      } catch (err) { }
    }

    if (!session) {
      session = await AnalysisSession.create({
        organizationId: orgId,
        query: message,
        status: 'pending',
        messages: []
      });
    }

    if (!session.messages) session.messages = [];

    // Add user message
    session.messages.push({
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: new Date()
    });

    await session.save();

    const lowerMsg = message.toLowerCase();
    let responseText = '';
    let responseType = 'analysis';

    const useRcaAgent = process.env.USE_RCA_AGENT_FOR_CHAT !== 'false';

    if (useRcaAgent) {
      try {
        // Resolve sheet_url: from body, or from latest data source's submitted URL (sourceUrl), or fallback to backend records API
        let sheetUrl: string | undefined = bodySheetUrl;
        if (!sheetUrl) {
          const latestSource = await DataSource.findOne(
            { organizationId: orgId, status: { $in: ['completed', 'connected'] } },
            { _id: 1, sourceUrl: 1 }
          )
            .sort({ uploadedAt: -1 })
            .lean();
          if (latestSource) {
            // Prefer the URL the user submitted (e.g. Google Sheets link); otherwise use our records API URL
            if (typeof latestSource.sourceUrl === 'string' && latestSource.sourceUrl.trim()) {
              sheetUrl = latestSource.sourceUrl.trim();
            } else {
              const baseUrl = process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
              if (baseUrl) {
                sheetUrl = `${baseUrl}/api/data-sources/${latestSource._id}/records`;
              }
            }
          }
        }
        // Same user = same actor_id; different chat = different thread_id (session._id)
        const actorId = req.user?.userId ?? 'anonymous';
        const agentResult = await invokeRCAAgent({
          prompt: message,
          orgId,
          sessionId: String(session._id),
          actorId,
          sheet_url: sheetUrl,
        });
        responseText = agentResult.result;
        responseType = 'analysis';
      } catch (agentError) {
        console.error('RCAagent invocation failed, falling back to template responder:', agentError);
      }
    }

    if (!responseText) {
      const suggestedFallback = await handleSuggestedQuestionFallback(orgId, lowerMsg);
      if (suggestedFallback) {
        responseText = suggestedFallback;
        responseType = 'analysis';
      } else if (isAnalysisQuery(lowerMsg)) {
        const result = await runFullAnalysis(String(session._id), orgId);
        responseText = generateChatResponse(message, result);
        responseType = 'analysis';
      } else if (isDataQuery(lowerMsg)) {
        responseText = await handleDataQuery(orgId, lowerMsg);
        responseType = 'data';
      } else {
        const dashboard = await DashboardState.findOne({ organizationId: orgId }).lean();
        if (dashboard && dashboard.liveSignals.length > 0) {
          const relevantSignals = dashboard.liveSignals
            .filter((s: any) => {
              const title = (s.title || '').toLowerCase();
              const desc = (s.description || '').toLowerCase();
              return lowerMsg.split(' ').some((word: string) =>
                word.length > 3 && (title.includes(word) || desc.includes(word))
              );
            })
            .slice(0, 3);

          if (relevantSignals.length > 0) {
            responseText = [
              `Based on current monitoring data, here's what I found:`,
              '',
              ...relevantSignals.map((s: any) =>
                `- **[${(s.severity || '').toUpperCase()}]** ${s.title}: ${s.description}`
              ),
              '',
              `Would you like me to run a detailed root cause analysis? Try asking: "${relevantSignals[0]?.suggestedQuery ?? 'Why is this happening?'}"`,
            ].join('\n');
            responseType = 'signals';
          }
        }

        if (!responseText) {
          responseText = [
            `I can help you understand your business performance. Here are things I can do:`,
            '',
            `- **Analyze anomalies**: "Why is revenue dropping despite high traffic?"`,
            `- **Check inventory**: "Which SKUs are out of stock?"`,
            `- **Review operations**: "What is our return rate?"`,
            `- **Understand trends**: "Show me revenue trends for the last week"`,
            '',
            dashboard?.liveSignals?.length
              ? `I currently see ${dashboard.liveSignals.length} active signals. Ask me about any of them!`
              : `Upload data through the Sources page to get started with analysis.`,
          ].join('\n');
          responseType = 'help';
        }
      }
    }

    // Add assistant message
    session.messages.push({
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: responseText,
      timestamp: new Date()
    });
    await session.save();

    return res.json({
      response: responseText,
      type: responseType,
      analysisId: session._id,
      sessionId: session._id
    });

  } catch (err) {
    console.error('Chat message error:', err);
    res.status(500).json({ message: 'Failed to process message' });
  }
});

function isAnalysisQuery(msg: string): boolean {
  const triggers = ['why', 'what caused', 'diagnose', 'analyze', 'root cause', 'investigate', 'explain'];
  return triggers.some((t) => msg.includes(t));
}

function isDataQuery(msg: string): boolean {
  const triggers = ['how many', 'show me', 'what is', 'list', 'which sku', 'revenue', 'inventory', 'stock', 'return rate'];
  return triggers.some((t) => msg.includes(t));
}

async function handleDataQuery(orgId: string, msg: string): Promise<string> {
  if (msg.includes('stock') || msg.includes('inventory') || msg.includes('out of stock')) {
    const latest = await InventoryRecord.aggregate([
      { $match: { organizationId: orgId } },
      { $sort: { date: -1 } },
      { $group: { _id: { sku: '$sku', location: '$location' }, qty: { $first: '$available_qty' } } },
      { $sort: { qty: 1 } },
      { $limit: 10 },
    ]);

    if (latest.length === 0) {
      return 'No inventory data available. Upload inventory data through the Sources page.';
    }

    const oos = latest.filter((i: any) => i.qty <= 0);
    const lines = [
      `**Inventory Status** (${latest.length} SKU-locations checked):`,
      '',
    ];

    if (oos.length > 0) {
      lines.push(`**Out of Stock (${oos.length}):**`);
      oos.forEach((i: any) => lines.push(`- ${i._id.sku} at ${i._id.location}: **0 units**`));
      lines.push('');
    }

    const inStock = latest.filter((i: any) => i.qty > 0).slice(0, 5);
    if (inStock.length > 0) {
      lines.push(`**Low Stock:**`);
      inStock.forEach((i: any) => lines.push(`- ${i._id.sku} at ${i._id.location}: ${i.qty} units`));
    }

    return lines.join('\n');
  }

  if (msg.includes('revenue') || msg.includes('sales')) {
    const daily = await RetailRecord.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          revenue: { $sum: '$revenue' },
          units: { $sum: '$units' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 7 },
    ]);

    if (daily.length === 0) {
      return 'No revenue data available. Upload sales/order data through the Sources page.';
    }

    const totalRev = daily.reduce((s: number, d: any) => s + d.revenue, 0);
    const totalUnits = daily.reduce((s: number, d: any) => s + d.units, 0);

    const lines = [
      `**Revenue Summary (Last ${daily.length} days):**`,
      '',
      `- Total Revenue: ₹${(totalRev / 100000).toFixed(1)}L`,
      `- Total Units: ${totalUnits.toLocaleString()}`,
      `- Avg Daily Revenue: ₹${(totalRev / daily.length / 1000).toFixed(1)}K`,
      '',
      '**Daily Breakdown:**',
      ...daily.map((d: any) => `- ${d._id}: ₹${(d.revenue / 1000).toFixed(1)}K (${d.units} units)`),
    ];

    return lines.join('\n');
  }

  if (msg.includes('return')) {
    const totals = await RetailRecord.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: null, units: { $sum: '$units' }, returns: { $sum: '$returns' } } },
    ]);

    if (totals.length === 0) return 'No return data available.';

    const rate = totals[0].units > 0 ? (totals[0].returns / totals[0].units * 100) : 0;
    return `**Return Rate:** ${rate.toFixed(1)}% (${totals[0].returns} returns out of ${totals[0].units} units sold)`;
  }

  return 'I can answer questions about revenue, inventory, returns, and more. Try asking something specific like "What is our return rate?" or "Which SKUs are out of stock?"';
}

async function handleSuggestedQuestionFallback(orgId: string, msg: string): Promise<string | null> {
  if (msg.includes('revenue dropping')) {
    const daily = await RetailRecord.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          revenue: { $sum: '$revenue' },
          traffic: { $sum: '$traffic' },
          units: { $sum: '$units' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]);

    if (daily.length < 6) return null;

    const latestWeek = daily.slice(0, 7);
    const prevWeek = daily.slice(7, 14);
    const latestRev = latestWeek.reduce((sum: number, d: any) => sum + (d.revenue ?? 0), 0);
    const prevRev = prevWeek.reduce((sum: number, d: any) => sum + (d.revenue ?? 0), 0);
    const latestTraffic = latestWeek.reduce((sum: number, d: any) => sum + (d.traffic ?? 0), 0);
    const prevTraffic = prevWeek.reduce((sum: number, d: any) => sum + (d.traffic ?? 0), 0);
    const latestUnits = latestWeek.reduce((sum: number, d: any) => sum + (d.units ?? 0), 0);
    const prevUnits = prevWeek.reduce((sum: number, d: any) => sum + (d.units ?? 0), 0);

    const revDropPct = percentChange(latestRev, prevRev);
    const trafficDeltaPct = percentChange(latestTraffic, prevTraffic);
    const unitsDeltaPct = percentChange(latestUnits, prevUnits);
    const likelyReason =
      trafficDeltaPct >= 0 && unitsDeltaPct < 0
        ? 'traffic is stable, but conversion or checkout performance looks weaker'
        : trafficDeltaPct < 0
          ? 'top-funnel demand is softer, which is pulling total sales down'
          : 'both demand and order volume are down versus last week';

    return [
      `I reviewed the latest 14 days of retail data.`,
      '',
      `- Revenue change vs previous 7 days: **${formatSignedPercent(revDropPct)}**`,
      `- Traffic change: **${formatSignedPercent(trafficDeltaPct)}**`,
      `- Units sold change: **${formatSignedPercent(unitsDeltaPct)}**`,
      '',
      `Most likely driver: ${likelyReason}.`,
      `If you want, I can break this down by SKU to isolate the biggest contributors.`,
    ].join('\n');
  }

  if (msg.includes('stockout risk') || msg.includes('stockout')) {
    const latestInventory = await InventoryRecord.aggregate([
      { $match: { organizationId: orgId } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: { sku: '$sku', location: '$location' },
          available_qty: { $first: '$available_qty' },
        },
      },
      { $sort: { available_qty: 1 } },
      { $limit: 15 },
    ]);

    if (latestInventory.length === 0) return null;

    const outOfStock = latestInventory.filter((r: any) => r.available_qty <= 0);
    const lowStock = latestInventory.filter((r: any) => r.available_qty > 0 && r.available_qty <= 20).slice(0, 5);

    return [
      `Here is the current stockout risk snapshot from your latest inventory records:`,
      '',
      `- Out of stock: **${outOfStock.length}** SKU-locations`,
      `- Low stock (<=20 units): **${lowStock.length}** high-risk SKU-locations`,
      '',
      ...outOfStock.slice(0, 5).map((r: any) => `- OOS: ${r._id.sku} at ${r._id.location}`),
      ...lowStock.map((r: any) => `- Low: ${r._id.sku} at ${r._id.location} (${r.available_qty} units)`),
      '',
      `I can also estimate revenue exposure for these SKUs if you want the impact view.`,
    ].join('\n');
  }

  if (msg.includes('trending products this month') || (msg.includes('trending') && msg.includes('product'))) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthSoFar = await RetailRecord.aggregate([
      { $match: { organizationId: orgId, date: { $gte: monthStart } } },
      {
        $group: {
          _id: '$sku',
          revenue: { $sum: '$revenue' },
          units: { $sum: '$units' },
          traffic: { $sum: '$traffic' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]);

    if (monthSoFar.length === 0) return null;

    return [
      `Top trending products this month (ranked by revenue):`,
      '',
      ...monthSoFar.map((r: any, idx: number) =>
        `${idx + 1}. ${r._id}: ₹${(r.revenue / 1000).toFixed(1)}K revenue, ${r.units} units, ${(r.traffic ?? 0).toLocaleString()} traffic`
      ),
      '',
      `If helpful, I can compare these with last month to show true momentum vs base popularity.`,
    ].join('\n');
  }

  if (
    msg.includes('actions to boost sales')
    || (msg.includes('boost') && msg.includes('sales'))
    || (msg.includes('actions') && msg.includes('sales'))
  ) {
    const perf = await RetailRecord.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: null,
          traffic: { $sum: '$traffic' },
          units: { $sum: '$units' },
          returns: { $sum: '$returns' },
          revenue: { $sum: '$revenue' },
        },
      },
    ]);

    if (perf.length === 0) return null;

    const row = perf[0] as { traffic: number; units: number; returns: number; revenue: number };
    const conversion = row.traffic > 0 ? (row.units / row.traffic) * 100 : 0;
    const returnRate = row.units > 0 ? (row.returns / row.units) * 100 : 0;
    const aov = row.units > 0 ? row.revenue / row.units : 0;

    const actions: string[] = [];
    if (conversion < 2) actions.push('Improve conversion on top landing/product pages (traffic is not translating into orders).');
    if (returnRate > 7) actions.push('Reduce returns via tighter SKU-level quality checks and clearer PDP sizing/fit information.');
    if (aov < 1000) actions.push('Increase AOV with bundles or threshold-based cart offers on high-traffic SKUs.');
    if (actions.length === 0) actions.push('Scale high-performing SKUs and regions with focused spend while keeping current conversion guardrails.');

    return [
      `Based on current data, these are the highest-impact sales actions:`,
      '',
      `- Conversion: **${conversion.toFixed(2)}%**`,
      `- Return rate: **${returnRate.toFixed(2)}%**`,
      `- Avg order value proxy: **₹${aov.toFixed(0)}**`,
      '',
      ...actions.map((a) => `- ${a}`),
    ].join('\n');
  }

  return null;
}

function percentChange(current: number, baseline: number): number {
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / baseline) * 100;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export default router;
