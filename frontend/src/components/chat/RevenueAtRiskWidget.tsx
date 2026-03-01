import React from 'react';
import { AlertCircle, ArrowRight, Activity, TrendingDown, Package, Truck, BarChart3 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const RevenueAtRiskWidget: React.FC = () => {
    const { kpiSummary, revenueAtRiskSeries, hasData } = useDashboardStore();

    if (!hasData || !kpiSummary) return (
        <div className="p-4 border border-dashed border-gray-200 text-center">
            <p className="text-[10px] font-mono text-gray-400">WAITING FOR REVENUE DATA...</p>
        </div>
    );

    const revDelta = kpiSummary.revenueDeltaPercent ?? 0;
    const isNegative = revDelta < 0;
    const rarTotal = kpiSummary.revenueAtRiskTotal ?? 0;
    const decomp = kpiSummary.rarDecomposition;

    // Prepare chart data for a mini sparkline
    const sparklineData = revenueAtRiskSeries.slice(-7).map(d => ({ value: d.revenue }));

    // Build decomposition bars
    const decompEntries = decomp ? [
        { key: 'inventory', label: 'Inventory', value: decomp.inventoryLeak, color: '#DC2626', icon: Package },
        { key: 'conversion', label: 'Conversion', value: decomp.conversionLeak, color: '#7C3AED', icon: TrendingDown },
        { key: 'ops', label: 'Operations', value: decomp.opsLeak, color: '#CA8A04', icon: Truck },
        { key: 'channel', label: 'Channel Mix', value: decomp.channelMixLeak, color: '#2563EB', icon: BarChart3 },
    ].filter(d => d.value > 0) : [];

    const decompTotal = decompEntries.reduce((s, d) => s + d.value, 0);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold tracking-widest text-gray-400 uppercase">Revenue Health</span>
                {isNegative && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded-none animate-pulse">
                        <AlertCircle size={8} /> AT RISK
                    </span>
                )}
            </div>

            {/* Main Revenue Number */}
            <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-serif italic text-gray-900">
                        ₹{formatNum(kpiSummary.totalRevenue)}
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${isNegative ? 'text-red-500' : 'text-green-600'}`}>
                        {isNegative ? '↓' : '↑'}{Math.abs(revDelta).toFixed(1)}%
                    </span>
                </div>
                <p className="text-[10px] font-mono text-gray-400 uppercase tracking-tighter font-extrabold">Weekly Revenue Performance (WoW)</p>
            </div>

            {/* Revenue at Risk Block */}
            {rarTotal > 0 && (
                <div className="bg-red-50/80 border border-red-100 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-mono font-bold text-red-800 uppercase tracking-wider">Revenue at Risk</span>
                        <span className="text-lg font-serif italic text-red-700 font-bold">₹{formatNum(rarTotal)}</span>
                    </div>

                    {/* Decomposition Bar */}
                    {decompEntries.length > 0 && (
                        <div className="space-y-2">
                            <div className="h-2 w-full bg-red-100 flex overflow-hidden">
                                {decompEntries.map(entry => (
                                    <div
                                        key={entry.key}
                                        style={{
                                            width: `${decompTotal > 0 ? (entry.value / decompTotal) * 100 : 0}%`,
                                            backgroundColor: entry.color,
                                        }}
                                        className="h-full transition-all duration-500"
                                    />
                                ))}
                            </div>
                            <div className="space-y-1">
                                {decompEntries.map(entry => {
                                    const Icon = entry.icon;
                                    return (
                                        <div key={entry.key} className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5" style={{ backgroundColor: entry.color }} />
                                                <Icon size={9} style={{ color: entry.color }} />
                                                <span className="text-[9px] font-mono text-gray-600 uppercase">{entry.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono font-bold text-gray-800">₹{formatNum(entry.value)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Mini Sparkline */}
            <div className="h-16 w-full mt-1 relative overflow-hidden bg-gray-50/50">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparklineData}>
                        <defs>
                            <linearGradient id="widgetRevGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={isNegative ? "#EF4444" : "#10B981"} stopOpacity={0.1} />
                                <stop offset="100%" stopColor={isNegative ? "#EF4444" : "#10B981"} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={isNegative ? "#EF4444" : "#10B981"}
                            strokeWidth={1.5}
                            fillOpacity={1}
                            fill="url(#widgetRevGradient)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
                {/* Glossy overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent pointer-events-none" />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-px bg-gray-100">
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">Total Orders</div>
                    <div className="text-sm font-semibold text-gray-800">{kpiSummary.totalOrders.toLocaleString()}</div>
                    <div className={`text-[9px] font-mono mt-0.5 ${kpiSummary.ordersDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {kpiSummary.ordersDelta >= 0 ? '+' : ''}{kpiSummary.ordersDelta.toLocaleString()} WoW
                    </div>
                </div>
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">Avg Order Val</div>
                    <div className="text-sm font-semibold text-gray-800">₹{kpiSummary.avgOrderValue}</div>
                    <div className="text-[9px] font-mono text-gray-400 mt-0.5">BASE: ₹{Math.round(kpiSummary.avgOrderValue - kpiSummary.aovDelta)}</div>
                </div>
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">OOS Rate</div>
                    <div className="text-sm font-semibold text-gray-800">{kpiSummary.oosRate}%</div>
                    <div className={`text-[9px] font-mono mt-0.5 ${kpiSummary.oosDelta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {kpiSummary.oosDelta > 0 ? '+' : ''}{kpiSummary.oosDelta}% WoW
                    </div>
                </div>
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">Return Rate</div>
                    <div className="text-sm font-semibold text-gray-800">{kpiSummary.returnRate}%</div>
                    <div className={`text-[9px] font-mono mt-0.5 ${kpiSummary.returnDelta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {kpiSummary.returnDelta > 0 ? '+' : ''}{kpiSummary.returnDelta}% WoW
                    </div>
                </div>
            </div>

            {/* Contextual Insight */}
            <div className="bg-gray-900 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-violet-300">
                    <Activity size={12} />
                    <span className="text-[10px] font-mono font-bold tracking-tight">AI PREDICTION</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-snug font-serif italic">
                    {rarTotal > 0
                        ? `₹${formatNum(rarTotal)} revenue at risk detected. Primary driver: ${decompEntries.length > 0 ? decompEntries[0].label.toLowerCase() : 'multiple factors'}. Immediate action recommended to prevent further erosion.`
                        : isNegative
                            ? "Revenue trend shows decline. Monitor closely for acceleration."
                            : "Revenue trend is healthy. Seasonal uplift expected to continue."}
                </p>
                <button className="text-[9px] font-mono text-white flex items-center gap-1 mt-1 hover:underline active:scale-95 transition-all">
                    VIEW REPORT <ArrowRight size={10} />
                </button>
            </div>
        </div>
    );
};

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default RevenueAtRiskWidget;
