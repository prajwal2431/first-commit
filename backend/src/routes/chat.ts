import { Router, Request, Response } from 'express';
import { AnalysisSession } from '../models/AnalysisSession';
import { DashboardState } from '../models/DashboardState';
import { RetailRecord } from '../models/RetailRecord';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';
import { generateChatResponse } from '../services/analysis/narrator';
import { runFullAnalysis } from '../services/analysis/runAnalysis';

const router = Router();

router.post('/message', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const lowerMsg = message.toLowerCase();

    if (isAnalysisQuery(lowerMsg)) {
      const session = await AnalysisSession.create({
        organizationId: orgId,
        query: message,
        status: 'pending',
      });

      const result = await runFullAnalysis(String(session._id), orgId);
      const response = generateChatResponse(message, result);

      return res.json({
        response,
        analysisId: session._id,
        type: 'analysis',
      });
    }

    if (isDataQuery(lowerMsg)) {
      const response = await handleDataQuery(orgId, lowerMsg);
      return res.json({ response, type: 'data' });
    }

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
        const response = [
          `Based on current monitoring data, here's what I found:`,
          '',
          ...relevantSignals.map((s: any) =>
            `- **[${(s.severity || '').toUpperCase()}]** ${s.title}: ${s.description}`
          ),
          '',
          `Would you like me to run a detailed root cause analysis? Try asking: "${relevantSignals[0]?.suggestedQuery ?? 'Why is this happening?'}"`,
        ].join('\n');

        return res.json({ response, type: 'signals' });
      }
    }

    const response = [
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

    res.json({ response, type: 'help' });
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

export default router;
