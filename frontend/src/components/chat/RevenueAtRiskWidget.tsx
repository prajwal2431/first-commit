import React from 'react';
import { AlertCircle, ArrowRight, Activity } from 'lucide-react';
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

    // Prepare chart data for a mini sparkline
    const sparklineData = revenueAtRiskSeries.slice(-7).map(d => ({ value: d.revenue }));

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

            {/* Mini Sparkline */}
            <div className="h-16 w-full mt-2 relative overflow-hidden bg-gray-50/50">
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
            <div className="grid grid-cols-2 gap-px bg-gray-100 mt-2">
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">Total Orders</div>
                    <div className="text-sm font-semibold text-gray-800">{kpiSummary.totalOrders.toLocaleString()}</div>
                    <div className="text-[9px] font-mono text-green-600 mt-0.5">+{kpiSummary.ordersDelta.toLocaleString()} WoW</div>
                </div>
                <div className="bg-white p-3">
                    <div className="text-[9px] font-mono text-gray-400 uppercase mb-1">Avg Order Val</div>
                    <div className="text-sm font-semibold text-gray-800">₹{kpiSummary.avgOrderValue}</div>
                    <div className="text-[9px] font-mono text-gray-400 mt-0.5">BASE: ₹{Math.round(kpiSummary.avgOrderValue - kpiSummary.aovDelta)}</div>
                </div>
            </div>

            {/* Contextual Insight */}
            <div className="bg-gray-900 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-violet-300">
                    <Activity size={12} />
                    <span className="text-[10px] font-mono font-bold tracking-tight">AI PREDICTION</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-snug font-serif italic">
                    {isNegative
                        ? "Revenue drop detected in Disney Collection. High risk of missing monthly target by 12% if no action taken."
                        : "Revenue trend is healthy. Seasonal uplift expected to continue for another 4 days."}
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
