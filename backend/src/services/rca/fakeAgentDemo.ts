/**
 * Fake RCA agent for demo/video recording.
 * Uses live signals + dashboard data so the answer matches what the graph/UI shows.
 * No agent call; only delay + templated responses filled with real data.
 */

import type { LiveSignal, KpiSummary } from '../../models/DashboardState';

export interface DemoContext {
  liveSignals: LiveSignal[];
  kpiSummary?: Partial<KpiSummary> | null;
  /** Pre-fetched data response (e.g. from handleDataQuery) for inventory/revenue/returns so reply matches real data. */
  dataResponse?: string | null;
}

export interface FakeAgentMatch {
  /** Delay in ms before responding (can add jitter via delayJitterMs). */
  delayMs: number;
  /** ± jitter in ms so delay isn't exactly the same every time. */
  delayJitterMs?: number;
  /** One string = single response; two = first "thinking" then full answer. */
  responses: [string] | [string, string];
}

type ResponseKind = 'analysis' | 'data' | 'chitchat' | 'drill';

/** Keyword/phrase → match config. First matching rule wins (order matters). */
const QUESTION_MAPPING: Array<{ pattern: RegExp | string; match: FakeAgentMatch; kind: ResponseKind }> = [
  // ---- Analysis / root cause (long delay, often 2 parts) ----
  {
    kind: 'analysis',
    pattern: /why\s+(is|did|has|are|was)|root\s*cause|what\s+caused|diagnos(e|is)|investigate|revenue\s+drop|stockout|out\s+of\s+stock\s+impact/i,
    match: {
      delayMs: 28000,
      delayJitterMs: 4000,
      responses: [
        'Let me analyze the data and run root cause checks…',
        `**Root cause analysis**

Based on the data and signals:

1. **Primary cause** — Revenue drop aligns with stockout events for top SKUs (SKU-101, SKU-205). Inventory was depleted 2–3 days before the dip.

2. **Contributing factors**
   - Demand spike in certain regions (North, West) increased run rate.
   - Replenishment lead time was longer than usual (~5 days).

3. **Evidence**
   - Stockout events logged for 4 SKUs in the same window.
   - Revenue recovered once restock completed.

**Recommendations**
- **Ops / Inventory**: Set safety stock and reorder points for SKU-101, SKU-205; consider regional buffer for North/West.
- **Planning**: Review lead times with suppliers and adjust reorder triggers.

I can drill into a specific SKU or region if you want.`,
      ],
    },
  },
  {
    kind: 'analysis',
    pattern: /analyze|run\s+analysis|full\s+analysis|deep\s+dive/i,
    match: {
      delayMs: 22000,
      delayJitterMs: 5000,
      responses: [
        'Running full analysis across revenue, inventory, and signals…',
        `**Analysis summary**

- **Revenue**: WoW down ~12%; main drop in last 3 days.
- **Inventory**: 4 SKUs hit stockout; 2 have been restocked.
- **Signals**: 3 high-severity signals (stockout, delivery delay, returns spike).

Root cause chain: stockouts → lost orders → revenue drop. Delivery and returns are secondary.

Next step: I can assign owners and suggested actions, or zoom into one area.`,
      ],
    },
  },
  {
    kind: 'analysis',
    pattern: /what(\s+are|\s+is)\s+the\s+(top|main|primary)\s+(cause|reason)|explain\s+the\s+drop/i,
    match: {
      delayMs: 24000,
      delayJitterMs: 4000,
      responses: [
        'Checking hypotheses against the data…',
        `**Primary cause**

The main driver of the revenue drop is **stockouts on high-velocity SKUs**. Evidence:

- Stockout events and revenue dip share the same time window.
- Affected SKUs (e.g. SKU-101) contribute ~40% of daily revenue.
- Once restocked, revenue trend recovers.

Secondary: delivery delays and higher returns in one region, but impact is smaller. I can break down by region or SKU if needed.`,
      ],
    },
  },

  // ---- Follow-up: "yes go ahead" / "drill down" (after "I can drill into...") ----
  {
    kind: 'drill',
    pattern: /^(yes|yeah|yep|sure|ok|okay|go\s*ahead|please|drill\s*(down|in)?|zoom\s*in|break\s*down|tell\s*me\s*more)\s*[!.]?$/i,
    match: {
      delayMs: 6000,
      delayJitterMs: 2500,
      responses: [
        'Pulling SKU and region breakdown…',
        `**Drill-down summary**

- **Top signals**: (see list above)
- **By SKU**: Focus on restocking the highest-velocity SKUs first.
- **By region**: North and West show the largest demand–inventory gap.

I can assign owners to these actions or dig into one signal in more detail.`,
      ],
    },
  },

  // ---- Short / chitchat (quick reply) ----
  {
    kind: 'chitchat',
    pattern: /^(hi|hello|hey|hi there)\s*[!.]?$/i,
    match: {
      delayMs: 1200,
      delayJitterMs: 800,
      responses: ['Hi! I can help with root cause analysis, revenue and inventory checks, and recommendations. What would you like to look at?'],
    },
  },
  {
    kind: 'chitchat',
    pattern: /^(thanks?|thank you|thx)\s*[!.]?$/i,
    match: {
      delayMs: 800,
      delayJitterMs: 500,
      responses: ["You're welcome. Ask anytime if you want to dig deeper or run another analysis."],
    },
  },
  {
    kind: 'chitchat',
    pattern: /what\s+can\s+you\s+do|help|how\s+do\s+i\s+use|capabilities/i,
    match: {
      delayMs: 3500,
      delayJitterMs: 1500,
      responses: [
        `I can help with:

- **Root cause analysis** — e.g. "Why is revenue dropping?" or "What caused the stockout?"
- **Data checks** — revenue, inventory, returns, SKU-level status.
- **Recommendations** — prioritized actions with suggested owners.

Ask in plain language; I'll analyze your data and give you answers with evidence.`,
      ],
    },
  },

  // ---- Data-style (medium delay) ----
  {
    kind: 'data',
    pattern: /stock|inventory|sku|out\s+of\s+stock|which\s+skus/i,
    match: {
      delayMs: 5000,
      delayJitterMs: 2000,
      responses: [
        `**Inventory snapshot**

- **Out of stock**: SKU-101 (Mumbai), SKU-205 (Delhi), SKU-088 (Bangalore)
- **Low stock** (< 20 units): SKU-102, SKU-206
- **Healthy**: 12 SKU-location pairs above threshold

I can run a root cause on any of the stockout SKUs if you want.`,
      ],
    },
  },
  {
    kind: 'data',
    pattern: /revenue|sales|revenue\s+trend|how\s+much\s+revenue/i,
    match: {
      delayMs: 4500,
      delayJitterMs: 2000,
      responses: [
        `**Revenue (last 7 days)**

- Total: ₹12.4L (~8% WoW down)
- Avg daily: ₹1.77L
- Top day: ₹2.1L (Mon); lowest: ₹1.2L (Thu–Fri)

The dip aligns with stockout events. Want a full root cause breakdown?`,
      ],
    },
  },
  {
    kind: 'data',
    pattern: /return\s+rate|returns/i,
    match: {
      delayMs: 4000,
      delayJitterMs: 1500,
      responses: [
        `**Return rate**: 4.2% (vs 3.8% last week). Slight spike in North region; possible link to delivery delays. I can tie this into the main analysis if you want.`,
      ],
    },
  },

  // ---- Default ----
  {
    kind: 'chitchat',
    pattern: /.*/,
    match: {
      delayMs: 6000,
      delayJitterMs: 3000,
      responses: [
        `I can help with root cause analysis, revenue and inventory checks, and recommendations. Try:

- "Why is revenue dropping?"
- "Which SKUs are out of stock?"
- "Run a full analysis"

Or ask anything about your data and I’ll work from there.`,
      ],
    },
  },
];

function matchQuestion(message: string): { match: FakeAgentMatch; kind: ResponseKind } {
  const trimmed = message.trim().toLowerCase();
  for (const entry of QUESTION_MAPPING) {
    const { pattern, match, kind } = entry;
    if (typeof pattern === 'string') {
      if (trimmed.includes(pattern.toLowerCase())) return { match, kind };
    } else {
      if (pattern.test(trimmed) || pattern.test(message)) return { match, kind };
    }
  }
  const last = QUESTION_MAPPING[QUESTION_MAPPING.length - 1];
  return { match: last.match, kind: last.kind };
}

/** Build response text from live signals + kpi so the answer matches the dashboard/graph. */
function buildResponseFromContext(ctx: DemoContext, kind: ResponseKind): [string] | [string, string] | null {
  const { liveSignals, kpiSummary, dataResponse } = ctx;
  const kpi = kpiSummary ?? {};
  const revDelta = kpi.revenueDeltaPercent != null ? kpi.revenueDeltaPercent : null;
  const revDeltaStr = revDelta != null ? `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(1)}%` : '~12%';
  const signalCount = liveSignals.length;
  const signalTitles = liveSignals.slice(0, 4).map((s) => s.title).filter(Boolean);
  const signalList = signalTitles.length > 0 ? signalTitles.join(', ') : 'stockout, delivery delay, returns spike';
  const oosRateStr = kpi.oosRate != null ? `${Number(kpi.oosRate).toFixed(1)}%` : null;
  const returnRateStr = kpi.returnRate != null ? `${Number(kpi.returnRate).toFixed(1)}%` : null;

  if (kind === 'data' && dataResponse && dataResponse.trim()) {
    return [dataResponse];
  }

  if (kind === 'drill') {
    const topSignals = liveSignals.slice(0, 5);
    const bySku = topSignals.filter((s) => /sku|stock|inventory/i.test(s.title || '')).map((s) => s.title).slice(0, 3);
    const byRegion = topSignals.filter((s) => /region|location|city|bangalore|delhi|mumbai/i.test(s.title || s.description || '')).map((s) => s.title || s.description).slice(0, 3);
    const list = topSignals.map((s) => `- **${s.title}**: ${(s.description || s.evidenceSnippet || '').slice(0, 80)}${(s.description || s.evidenceSnippet || '').length > 80 ? '…' : ''}`).join('\n');
    const part2 = `**Drill-down summary**

**Top signals (${liveSignals.length}):**
${list || '- No additional signals to drill into right now.'}
${bySku.length > 0 ? `\n**By SKU**: Focus on ${bySku.join(', ')} for restocking.` : ''}
${byRegion.length > 0 ? `\n**By region**: ${byRegion.join(', ')} show the largest impact.` : ''}

I can assign owners to these actions or dig into one signal in more detail.`;
    return [
      'Pulling SKU and region breakdown…',
      part2,
    ];
  }

  if (kind === 'analysis') {
    const part2 = `**Root cause analysis**

Based on the data and signals${signalCount > 0 ? ` (${signalCount} active signal${signalCount === 1 ? '' : 's'})` : ''}:

1. **Primary cause** — Revenue ${revDelta != null && revDelta < 0 ? `is down ${revDeltaStr} WoW` : 'drop'} aligns with stockout events for high-velocity SKUs. Inventory was depleted 2–3 days before the dip.

2. **Contributing factors**
   - ${signalCount > 0 ? `Signals: ${signalList}.` : 'Demand spike in certain regions increased run rate.'}
   - Replenishment lead time was longer than usual.

3. **Evidence**
   - Stockout events logged in the same window as the revenue dip.
   - Revenue recovers once restock completes.

**Recommendations**
- **Ops / Inventory**: Set safety stock and reorder points; consider regional buffer.
- **Planning**: Review lead times with suppliers and adjust reorder triggers.

I can drill into a specific SKU or region if you want.`;
    return [
      'Let me analyze the data and run root cause checks…',
      part2,
    ];
  }

  return null;
}

function applyJitter(ms: number, jitterMs?: number): number {
  if (!jitterMs || jitterMs <= 0) return ms;
  const jitter = (Math.random() * 2 - 1) * jitterMs;
  return Math.max(500, Math.round(ms + jitter));
}

export interface FakeAgentResult {
  /** Total delay that was applied (ms). */
  delayMs: number;
  /** Single combined response (for backward compatibility). */
  response: string;
  /** When present, frontend can show multiple messages in sequence. */
  responses?: string[];
}

/**
 * Get fake agent response for demo mode: match question, wait with realistic delay, return answer(s).
 * When context is provided, responses use live signals + kpi + data so the answer matches the graph/UI.
 */
export async function getFakeAgentResponse(message: string, context?: DemoContext | null): Promise<FakeAgentResult> {
  const { match, kind } = matchQuestion(message);
  const delayMs = applyJitter(match.delayMs, match.delayJitterMs);

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  let responses: string[];
  const fromContext = context && buildResponseFromContext(context, kind);
  if (fromContext) {
    responses = [...fromContext];
  } else {
    responses = [...match.responses];
  }

  const response = responses.join('\n\n');

  return {
    delayMs,
    response,
    responses: responses.length > 1 ? responses : undefined,
  };
}
