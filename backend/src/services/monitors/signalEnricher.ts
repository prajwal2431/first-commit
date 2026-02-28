import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { InventoryRecord } from '../../models/InventoryRecord';
import { FulfilmentRecord } from '../../models/FulfilmentRecord';
import { WeatherRecord } from '../../models/WeatherRecord';
import { LiveSignal } from '../../models/DashboardState';

export interface EnrichedEvidence {
    dataPoints: Array<{ label: string; value: string | number; delta?: number }>;
    chartData: Array<Record<string, any>>;
    chartType: 'area' | 'bar' | 'line';
    chartKeys: { x: string; y: string[]; colors: string[] };
    affectedItems: Array<{ name: string; impact: string; detail: string }>;
    rootCauseSummary: string;
}

export interface SignalInsightData {
    signal: LiveSignal;
    evidence: EnrichedEvidence;
    aiSummary: string;
    recommendedActions: Array<{
        action: string;
        priority: 'high' | 'medium' | 'low';
        department: string;
    }>;
    relatedSignals: LiveSignal[];
}

export async function enrichSignal(
    organizationId: string,
    signal: LiveSignal,
    allSignals: LiveSignal[]
): Promise<SignalInsightData> {
    let evidence: EnrichedEvidence;

    switch (signal.monitorType) {
        case 'revenue':
            evidence = await enrichRevenueSignal(organizationId, signal);
            break;
        case 'inventory':
            evidence = await enrichInventorySignal(organizationId, signal);
            break;
        case 'operations':
            evidence = await enrichOperationsSignal(organizationId, signal);
            break;
        case 'demand':
            evidence = await enrichDemandSignal(organizationId, signal);
            break;
        default:
            evidence = buildFallbackEvidence(signal);
    }

    const aiSummary = generateAiSummary(signal, evidence);
    const recommendedActions = generateActions(signal, evidence);
    const relatedSignals = allSignals.filter(
        (s) => s.id !== signal.id && s.monitorType === signal.monitorType
    );

    return { signal, evidence, aiSummary, recommendedActions, relatedSignals };
}

// ─── Revenue Enrichment ────────────────────────────────────────────────────────
async function enrichRevenueSignal(orgId: string, signal: LiveSignal): Promise<EnrichedEvidence> {
    const retailData = await RetailRecord.find({ organizationId: orgId })
        .sort({ date: 1 })
        .lean();

    const orderData = await OrderRecord.find({ organizationId: orgId })
        .sort({ date: 1 })
        .lean();

    const dailyMap = new Map<string, { revenue: number; orders: number; traffic: number }>();
    for (const r of retailData) {
        const key = new Date(r.date).toISOString().slice(0, 10);
        const ex = dailyMap.get(key) ?? { revenue: 0, orders: 0, traffic: 0 };
        ex.revenue += r.revenue;
        ex.orders += 1;
        ex.traffic += r.traffic;
        dailyMap.set(key, ex);
    }
    for (const o of orderData) {
        const key = new Date(o.date).toISOString().slice(0, 10);
        const ex = dailyMap.get(key) ?? { revenue: 0, orders: 0, traffic: 0 };
        ex.revenue += o.revenue;
        ex.orders += 1;
        dailyMap.set(key, ex);
    }

    const sorted = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    const recent7 = sorted.slice(-7);
    const prior7 = sorted.slice(-14, -7);

    const recentRev = recent7.reduce((s, [, d]) => s + d.revenue, 0);
    const priorRev = prior7.reduce((s, [, d]) => s + d.revenue, 0);
    const recentOrders = recent7.reduce((s, [, d]) => s + d.orders, 0);
    const priorOrders = prior7.reduce((s, [, d]) => s + d.orders, 0);
    const recentTraffic = recent7.reduce((s, [, d]) => s + d.traffic, 0);
    const priorTraffic = prior7.reduce((s, [, d]) => s + d.traffic, 0);

    const revDelta = priorRev > 0 ? ((recentRev - priorRev) / priorRev) * 100 : 0;
    const orderDelta = priorOrders > 0 ? ((recentOrders - priorOrders) / priorOrders) * 100 : 0;
    const trafficDelta = priorTraffic > 0 ? ((recentTraffic - priorTraffic) / priorTraffic) * 100 : 0;

    // Top SKU losers
    const skuRevenue = new Map<string, { recent: number; prior: number }>();
    for (const r of retailData) {
        const key = new Date(r.date).toISOString().slice(0, 10);
        const isRecent = recent7.some(([d]) => d === key);
        const isPrior = prior7.some(([d]) => d === key);
        if (!isRecent && !isPrior) continue;

        const ex = skuRevenue.get(r.sku) ?? { recent: 0, prior: 0 };
        if (isRecent) ex.recent += r.revenue;
        if (isPrior) ex.prior += r.revenue;
        skuRevenue.set(r.sku, ex);
    }

    const affectedItems = Array.from(skuRevenue.entries())
        .map(([sku, { recent, prior }]) => ({
            name: sku,
            impact: prior > 0 ? `${((recent - prior) / prior * 100).toFixed(1)}%` : 'N/A',
            detail: `₹${formatNum(recent)} (was ₹${formatNum(prior)})`,
            delta: prior > 0 ? (recent - prior) / prior * 100 : 0,
        }))
        .filter(i => i.delta < -5)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 5)
        .map(({ name, impact, detail }) => ({ name, impact, detail }));

    const chartData = sorted.slice(-14).map(([date, d]) => ({
        date: date.slice(5),
        revenue: Math.round(d.revenue),
        orders: d.orders,
        traffic: d.traffic,
    }));

    return {
        dataPoints: [
            { label: 'Weekly Revenue', value: `₹${formatNum(recentRev)}`, delta: Math.round(revDelta * 10) / 10 },
            { label: 'Orders', value: recentOrders, delta: Math.round(orderDelta * 10) / 10 },
            { label: 'Traffic', value: recentTraffic, delta: Math.round(trafficDelta * 10) / 10 },
            { label: 'AOV', value: recentOrders > 0 ? `₹${Math.round(recentRev / recentOrders)}` : '—' },
        ],
        chartData,
        chartType: 'area',
        chartKeys: { x: 'date', y: ['revenue', 'traffic'], colors: ['#121212', '#7C3AED'] },
        affectedItems,
        rootCauseSummary: buildRevenueCauseSummary(revDelta, orderDelta, trafficDelta, affectedItems),
    };
}

function buildRevenueCauseSummary(
    revDelta: number, orderDelta: number, trafficDelta: number,
    affectedItems: Array<{ name: string; impact: string }>
): string {
    const parts: string[] = [];
    if (trafficDelta > 5 && revDelta < -10) {
        parts.push('Traffic is up but revenue is down — this indicates a conversion problem, likely pricing or stockout related.');
    } else if (trafficDelta < -10 && revDelta < -10) {
        parts.push('Both traffic and revenue are declining — this could be a marketing or seasonal issue.');
    }
    if (orderDelta < -15) {
        parts.push(`Order volume dropped ${Math.abs(orderDelta).toFixed(0)}%, suggesting reduced purchase intent or availability issues.`);
    }
    if (affectedItems.length > 0) {
        parts.push(`Top affected SKUs: ${affectedItems.slice(0, 3).map(i => `${i.name} (${i.impact})`).join(', ')}.`);
    }
    return parts.join(' ') || 'Revenue trends show a deviation from expected patterns. Further investigation recommended.';
}

// ─── Inventory Enrichment ──────────────────────────────────────────────────────
async function enrichInventorySignal(orgId: string, signal: LiveSignal): Promise<EnrichedEvidence> {
    const inventoryData = await InventoryRecord.find({ organizationId: orgId })
        .sort({ date: -1 })
        .limit(500)
        .lean();

    const retailData = await RetailRecord.find({ organizationId: orgId })
        .sort({ date: -1 })
        .limit(500)
        .lean();

    // Build SKU-level inventory picture
    const skuInventory = new Map<string, { qty: number; location: string; demand: number }>();

    for (const r of inventoryData) {
        const existing = skuInventory.get(r.sku);
        if (!existing || r.available_qty < (existing.qty)) {
            skuInventory.set(r.sku, {
                qty: r.available_qty,
                location: r.location,
                demand: existing?.demand ?? 0,
            });
        }
    }

    // Overlay demand from retail
    for (const r of retailData) {
        const ex = skuInventory.get(r.sku);
        if (ex) ex.demand += r.units;
        else skuInventory.set(r.sku, { qty: -1, location: 'Unknown', demand: r.units });
    }

    const oosItems = Array.from(skuInventory.entries())
        .filter(([, v]) => v.qty <= 0)
        .sort((a, b) => b[1].demand - a[1].demand)
        .slice(0, 8);

    const affectedItems = oosItems.map(([sku, v]) => ({
        name: sku,
        impact: `${v.demand} units demand`,
        detail: `0 stock at ${v.location}`,
    }));

    // Location distribution
    const locationMap = new Map<string, { oos: number; total: number }>();
    for (const r of inventoryData) {
        const ex = locationMap.get(r.location) ?? { oos: 0, total: 0 };
        ex.total++;
        if (r.available_qty <= 0) ex.oos++;
        locationMap.set(r.location, ex);
    }

    const chartData = Array.from(locationMap.entries())
        .map(([location, { oos, total }]) => ({
            location: location.length > 12 ? location.slice(0, 12) + '…' : location,
            oosRate: total > 0 ? Math.round((oos / total) * 100) : 0,
            totalSkus: total,
        }))
        .sort((a, b) => b.oosRate - a.oosRate)
        .slice(0, 8);

    const totalSkus = skuInventory.size;
    const totalOos = Array.from(skuInventory.values()).filter(v => v.qty <= 0).length;

    return {
        dataPoints: [
            { label: 'OOS SKUs', value: totalOos },
            { label: 'Total SKUs', value: totalSkus },
            { label: 'OOS Rate', value: `${totalSkus > 0 ? ((totalOos / totalSkus) * 100).toFixed(1) : 0}%` },
            { label: 'Locations Affected', value: chartData.filter(d => d.oosRate > 0).length },
        ],
        chartData,
        chartType: 'bar',
        chartKeys: { x: 'location', y: ['oosRate'], colors: ['#DC2626'] },
        affectedItems,
        rootCauseSummary: `${totalOos} of ${totalSkus} SKUs are out of stock. ${oosItems.length > 0 ? `High-demand items like ${oosItems.slice(0, 2).map(([s]) => s).join(', ')} need immediate replenishment.` : ''}`,
    };
}

// ─── Operations Enrichment ─────────────────────────────────────────────────────
async function enrichOperationsSignal(orgId: string, signal: LiveSignal): Promise<EnrichedEvidence> {
    const fulfilmentData = await FulfilmentRecord.find({ organizationId: orgId })
        .sort({ dispatch_date: -1 })
        .limit(1000)
        .lean();

    const total = fulfilmentData.length;
    const returned = fulfilmentData.filter(r => r.status === 'rto' || r.status === 'returned');
    const delayed = fulfilmentData.filter(r => r.delay_days > 0);
    const cancelled = fulfilmentData.filter(r => r.status === 'cancelled');

    const returnRate = total > 0 ? (returned.length / total) * 100 : 0;
    const slaAdherence = total > 0 ? ((total - delayed.length) / total) * 100 : 100;

    // Carrier breakdown
    const carrierMap = new Map<string, { total: number; returns: number; delays: number }>();
    for (const r of fulfilmentData) {
        const ex = carrierMap.get(r.carrier) ?? { total: 0, returns: 0, delays: 0 };
        ex.total++;
        if (r.status === 'rto' || r.status === 'returned') ex.returns++;
        if (r.delay_days > 0) ex.delays++;
        carrierMap.set(r.carrier, ex);
    }

    const chartData = Array.from(carrierMap.entries())
        .map(([carrier, d]) => ({
            carrier: carrier || 'Unknown',
            returnRate: d.total > 0 ? Math.round((d.returns / d.total) * 100) : 0,
            delayRate: d.total > 0 ? Math.round((d.delays / d.total) * 100) : 0,
            shipments: d.total,
        }))
        .sort((a, b) => b.returnRate - a.returnRate)
        .slice(0, 6);

    // Region breakdown for affected items
    const regionReturns = new Map<string, number>();
    for (const r of returned) {
        regionReturns.set(r.region || 'Unknown', (regionReturns.get(r.region || 'Unknown') ?? 0) + 1);
    }

    const affectedItems = Array.from(regionReturns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({
            name: region,
            impact: `${count} returns`,
            detail: `${(count / (returned.length || 1) * 100).toFixed(0)}% of all returns`,
        }));

    return {
        dataPoints: [
            { label: 'Return Rate', value: `${returnRate.toFixed(1)}%` },
            { label: 'SLA Adherence', value: `${slaAdherence.toFixed(1)}%` },
            { label: 'Total Returns', value: returned.length },
            { label: 'Cancellations', value: cancelled.length },
        ],
        chartData,
        chartType: 'bar',
        chartKeys: { x: 'carrier', y: ['returnRate', 'delayRate'], colors: ['#DC2626', '#CA8A04'] },
        affectedItems,
        rootCauseSummary: `Return rate at ${returnRate.toFixed(1)}% with SLA adherence at ${slaAdherence.toFixed(1)}%. ${chartData.length > 0 ? `Carrier "${chartData[0].carrier}" has the highest return rate at ${chartData[0].returnRate}%.` : ''} ${affectedItems.length > 0 ? `Region "${affectedItems[0].name}" is most affected.` : ''}`,
    };
}

// ─── Demand Enrichment ─────────────────────────────────────────────────────────
async function enrichDemandSignal(orgId: string, signal: LiveSignal): Promise<EnrichedEvidence> {
    const retailData = await RetailRecord.find({ organizationId: orgId })
        .sort({ date: 1 })
        .lean();

    const dailyUnits = new Map<string, number>();
    const dailyRevenue = new Map<string, number>();

    for (const r of retailData) {
        const key = new Date(r.date).toISOString().slice(0, 10);
        dailyUnits.set(key, (dailyUnits.get(key) ?? 0) + r.units);
        dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + r.revenue);
    }

    const sorted = Array.from(dailyUnits.entries()).sort(([a], [b]) => a.localeCompare(b));
    const values = sorted.map(([, v]) => v);
    const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const peak = Math.max(...values, 0);

    const chartData = sorted.slice(-14).map(([date, units]) => ({
        date: date.slice(5),
        units,
        revenue: dailyRevenue.get(date.length === 5 ? `2024-${date}` : date) ?? dailyRevenue.get(sorted.find(([d]) => d.endsWith(date.slice(5)))?.[0] || '') ?? 0,
        average: Math.round(mean),
    }));

    // Fix chartData revenue from the sorted data
    const revenueChartData = sorted.slice(-14).map(([date, units]) => {
        const fullDate = date; // already full
        return {
            date: date.slice(5),
            units,
            revenue: Math.round(dailyRevenue.get(fullDate) ?? 0),
            average: Math.round(mean),
        };
    });

    // SKU-level spikes
    const skuDailyUnits = new Map<string, Map<string, number>>();
    for (const r of retailData) {
        const key = new Date(r.date).toISOString().slice(0, 10);
        if (!skuDailyUnits.has(r.sku)) skuDailyUnits.set(r.sku, new Map());
        const m = skuDailyUnits.get(r.sku)!;
        m.set(key, (m.get(key) ?? 0) + r.units);
    }

    const affectedItems: Array<{ name: string; impact: string; detail: string }> = [];
    for (const [sku, daily] of skuDailyUnits) {
        const vals = Array.from(daily.values());
        const skuMean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const lastVal = vals[vals.length - 1] ?? 0;
        if (lastVal > skuMean * 1.5 && lastVal > 10) {
            affectedItems.push({
                name: sku,
                impact: `+${((lastVal - skuMean) / Math.max(skuMean, 1) * 100).toFixed(0)}%`,
                detail: `${lastVal} units vs ${skuMean.toFixed(0)} avg`,
            });
        }
    }
    affectedItems.sort((a, b) => parseFloat(b.impact) - parseFloat(a.impact));

    // Check for weather context
    const weatherData = await WeatherRecord.find({ organizationId: orgId }).sort({ date: -1 }).limit(14).lean();
    let weatherContext = '';
    if (weatherData.length > 0) {
        const avgTemp = weatherData.reduce((s, w) => s + w.temp_max, 0) / weatherData.length;
        const avgRain = weatherData.reduce((s, w) => s + w.rainfall_mm, 0) / weatherData.length;
        if (avgRain > 10) weatherContext = ` Heavy rainfall (${avgRain.toFixed(0)}mm avg) may be influencing demand patterns.`;
        if (avgTemp > 35) weatherContext += ` High temperatures (${avgTemp.toFixed(0)}°C) could drive category-specific demand.`;
    }

    return {
        dataPoints: [
            { label: 'Peak Units', value: peak },
            { label: 'Avg Units', value: Math.round(mean) },
            { label: 'Spike Ratio', value: mean > 0 ? `${(peak / mean).toFixed(1)}x` : '—' },
            { label: 'Spiking SKUs', value: affectedItems.length },
        ],
        chartData: revenueChartData,
        chartType: 'line',
        chartKeys: { x: 'date', y: ['units', 'average'], colors: ['#7C3AED', '#9CA3AF'] },
        affectedItems: affectedItems.slice(0, 5),
        rootCauseSummary: `Demand spiked to ${peak} units against an average of ${Math.round(mean)}. ${affectedItems.length > 0 ? `Top spiking SKUs: ${affectedItems.slice(0, 3).map(i => i.name).join(', ')}.` : ''}${weatherContext}`,
    };
}

// ─── Fallback ──────────────────────────────────────────────────────────────────
function buildFallbackEvidence(signal: LiveSignal): EnrichedEvidence {
    return {
        dataPoints: [{ label: 'Signal', value: signal.title }],
        chartData: [],
        chartType: 'bar',
        chartKeys: { x: '', y: [], colors: [] },
        affectedItems: [],
        rootCauseSummary: signal.description,
    };
}

// ─── AI Summary Generator ──────────────────────────────────────────────────────
function generateAiSummary(signal: LiveSignal, evidence: EnrichedEvidence): string {
    const parts = [signal.description];

    if (evidence.rootCauseSummary) {
        parts.push(evidence.rootCauseSummary);
    }

    if (evidence.affectedItems.length > 0) {
        parts.push(`${evidence.affectedItems.length} item(s) are directly impacted and require attention.`);
    }

    const severityContext: Record<string, string> = {
        critical: 'This is a critical signal requiring immediate action to prevent further impact.',
        high: 'This signal indicates a significant issue that should be addressed within 24 hours.',
        medium: 'This is a moderate concern that should be reviewed and addressed in your next planning cycle.',
        low: 'This is an informational signal for awareness. Monitor for escalation.',
    };
    parts.push(severityContext[signal.severity] || '');

    return parts.filter(Boolean).join(' ');
}

// ─── Action Generator ──────────────────────────────────────────────────────────
function generateActions(
    signal: LiveSignal,
    evidence: EnrichedEvidence
): Array<{ action: string; priority: 'high' | 'medium' | 'low'; department: string }> {
    const actions: Array<{ action: string; priority: 'high' | 'medium' | 'low'; department: string }> = [];

    switch (signal.monitorType) {
        case 'revenue':
            actions.push(
                { action: 'Review pricing strategy for affected SKUs and compare with competitor prices', priority: 'high', department: 'Marketing' },
                { action: 'Analyze conversion funnel for drop-off points in the purchase flow', priority: 'high', department: 'Product' },
                { action: 'Check inventory levels for top-selling SKUs to rule out stockout-driven revenue loss', priority: 'medium', department: 'Supply Chain' },
                { action: 'Assess marketing campaign effectiveness and ad spend ROI for the current week', priority: 'medium', department: 'Marketing' },
            );
            if (evidence.affectedItems.length > 0) {
                actions.push({
                    action: `Investigate specific SKU performance: ${evidence.affectedItems.slice(0, 2).map(i => i.name).join(', ')}`,
                    priority: 'high',
                    department: 'Product',
                });
            }
            break;

        case 'inventory':
            actions.push(
                { action: 'Initiate emergency replenishment for out-of-stock high-demand SKUs', priority: 'high', department: 'Supply Chain' },
                { action: 'Evaluate inter-warehouse transfer opportunities for balanced distribution', priority: 'high', department: 'Operations' },
                { action: 'Update demand forecast models with latest sales velocity data', priority: 'medium', department: 'Supply Chain' },
                { action: 'Review and adjust safety stock levels based on current demand patterns', priority: 'medium', department: 'Supply Chain' },
            );
            break;

        case 'operations':
            actions.push(
                { action: 'Review carrier performance SLAs and escalate with underperforming carriers', priority: 'high', department: 'Operations' },
                { action: 'Analyze return reasons to identify quality or expectation-mismatch patterns', priority: 'high', department: 'Product' },
                { action: 'Audit packaging and handling processes at high-return warehouses', priority: 'medium', department: 'Operations' },
                { action: 'Evaluate regional logistics partners and consider alternatives for problem areas', priority: 'medium', department: 'Operations' },
            );
            break;

        case 'demand':
            actions.push(
                { action: 'Ensure adequate inventory for spiking SKUs to capitalize on demand', priority: 'high', department: 'Supply Chain' },
                { action: 'Analyze if the spike is organic, seasonal, or campaign-driven', priority: 'medium', department: 'Marketing' },
                { action: 'Adjust pricing strategy if demand elasticity allows for margin optimization', priority: 'medium', department: 'Finance' },
                { action: 'Prepare fulfillment capacity for sustained elevated demand levels', priority: 'medium', department: 'Operations' },
            );
            break;
    }

    return actions;
}

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}
