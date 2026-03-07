import { Router, Request, Response } from 'express';
import {
  getAnalysisSession,
  createAnalysisSession,
  updateAnalysisSession,
} from '../db/analysisSessionRepo';
import { getDashboardState } from '../db/dashboardStateRepo';
import { listDataSourcesByOrg } from '../db/dataSourceRepo';
import { listInventoryByOrg } from '../db/inventoryRepo';
import { listRetailByOrg } from '../db/retailRecordRepo';
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

    let session = null;
    if (sessionId) {
      session = await getAnalysisSession(orgId, sessionId);
    }

    if (!session) {
      session = await createAnalysisSession({
        organizationId: orgId,
        query: message,
        status: 'pending',
        messages: [],
      });
    }

    const messages = session.messages ?? [];
    messages.push({
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });
    await updateAnalysisSession(orgId, session.sessionId, { messages });

    const lowerMsg = message.toLowerCase();
    let responseText = '';
    let responseType = 'analysis';

    const useRcaAgent = process.env.USE_RCA_AGENT_FOR_CHAT !== 'false';

    if (useRcaAgent) {
      try {
        let sheetUrl: string | undefined = bodySheetUrl;
        if (!sheetUrl) {
          const sources = await listDataSourcesByOrg(orgId);
          const latestSource = sources.find((s) => ['completed', 'connected'].includes(s.status));
          if (latestSource) {
            if (typeof latestSource.sourceUrl === 'string' && latestSource.sourceUrl.trim()) {
              sheetUrl = latestSource.sourceUrl.trim();
            } else {
              const baseUrl = process.env.PUBLIC_API_BASE_URL?.replace(/\/$/, '');
              if (baseUrl) {
                sheetUrl = `${baseUrl}/api/data-sources/${latestSource.sourceId}/records`;
              }
            }
          }
        }
        const actorId = req.user?.userId ?? 'anonymous';
        const agentResult = await invokeRCAAgent({
          prompt: message,
          orgId,
          sessionId: session.sessionId,
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
      if (isAnalysisQuery(lowerMsg)) {
        const result = await runFullAnalysis(session.sessionId, orgId);
        responseText = generateChatResponse(message, result);
        responseType = 'analysis';
      } else if (isDataQuery(lowerMsg)) {
        responseText = await handleDataQuery(orgId, lowerMsg);
        responseType = 'data';
      } else {
        const dashboard = await getDashboardState(orgId);
        if (dashboard && dashboard.liveSignals.length > 0) {
          const relevantSignals = dashboard.liveSignals
            .filter((s) => {
              const title = (s.title || '').toLowerCase();
              const desc = (s.description || '').toLowerCase();
              return lowerMsg.split(' ').some((word: string) => word.length > 3 && (title.includes(word) || desc.includes(word)));
            })
            .slice(0, 3);

          if (relevantSignals.length > 0) {
            responseText = [
              `Based on current monitoring data, here's what I found:`,
              '',
              ...relevantSignals.map((s) => `- **[${(s.severity || '').toUpperCase()}]** ${s.title}: ${s.description}`),
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

    messages.push({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });
    await updateAnalysisSession(orgId, session.sessionId, { messages });

    return res.json({
      response: responseText,
      type: responseType,
      analysisId: session.sessionId,
      sessionId: session.sessionId,
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
    const inventoryData = await listInventoryByOrg(orgId);
    // Group by (sku, location), take latest by date (data is already sorted date desc), then sort by qty
    const bySkuLoc = new Map<string, { sku: string; location: string; qty: number }>();
    for (const r of inventoryData) {
      const key = `${r.sku}|${r.location}`;
      if (!bySkuLoc.has(key)) {
        bySkuLoc.set(key, { sku: r.sku, location: r.location, qty: r.available_qty });
      }
    }
    const latest = Array.from(bySkuLoc.values()).sort((a, b) => a.qty - b.qty).slice(0, 10);

    if (latest.length === 0) {
      return 'No inventory data available. Upload inventory data through the Sources page.';
    }

    const oos = latest.filter((i) => i.qty <= 0);
    const lines = [`**Inventory Status** (${latest.length} SKU-locations checked):`, ''];

    if (oos.length > 0) {
      lines.push(`**Out of Stock (${oos.length}):**`);
      oos.forEach((i) => lines.push(`- ${i.sku} at ${i.location}: **0 units**`));
      lines.push('');
    }

    const inStock = latest.filter((i) => i.qty > 0).slice(0, 5);
    if (inStock.length > 0) {
      lines.push(`**Low Stock:**`);
      inStock.forEach((i) => lines.push(`- ${i.sku} at ${i.location}: ${i.qty} units`));
    }

    return lines.join('\n');
  }

  if (msg.includes('revenue') || msg.includes('sales')) {
    const retailData = await listRetailByOrg(orgId);
    const byDate = new Map<string, { revenue: number; units: number }>();
    for (const r of retailData) {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const ex = byDate.get(key) ?? { revenue: 0, units: 0 };
      ex.revenue += r.revenue;
      ex.units += r.units;
      byDate.set(key, ex);
    }
    const daily = Array.from(byDate.entries())
      .map(([_id, d]) => ({ _id, revenue: d.revenue, units: d.units }))
      .sort((a, b) => b._id.localeCompare(a._id))
      .slice(0, 7);

    if (daily.length === 0) {
      return 'No revenue data available. Upload sales/order data through the Sources page.';
    }

    const totalRev = daily.reduce((s, d) => s + d.revenue, 0);
    const totalUnits = daily.reduce((s, d) => s + d.units, 0);

    const lines = [
      `**Revenue Summary (Last ${daily.length} days):**`,
      '',
      `- Total Revenue: ₹${(totalRev / 100000).toFixed(1)}L`,
      `- Total Units: ${totalUnits.toLocaleString()}`,
      `- Avg Daily Revenue: ₹${(totalRev / daily.length / 1000).toFixed(1)}K`,
      '',
      '**Daily Breakdown:**',
      ...daily.map((d) => `- ${d._id}: ₹${(d.revenue / 1000).toFixed(1)}K (${d.units} units)`),
    ];

    return lines.join('\n');
  }

  if (msg.includes('return')) {
    const retailData = await listRetailByOrg(orgId);
    let units = 0;
    let returns = 0;
    for (const r of retailData) {
      units += r.units;
      returns += r.returns;
    }

    if (units === 0 && returns === 0) return 'No return data available.';

    const rate = units > 0 ? (returns / units) * 100 : 0;
    return `**Return Rate:** ${rate.toFixed(1)}% (${returns} returns out of ${units} units sold)`;
  }

  return 'I can answer questions about revenue, inventory, returns, and more. Try asking something specific like "What is our return rate?" or "Which SKUs are out of stock?"';
}

export default router;
