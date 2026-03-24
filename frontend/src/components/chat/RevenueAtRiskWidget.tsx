import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, TrendingDown, Package, Truck, BarChart3, TrendingUp, Database, ArrowRight } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

/** Column count matches driver count so the row always fills width (no half-empty row for 3 items). */
function driverRiskGridClass(count: number): string {
    if (count <= 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 min-[400px]:grid-cols-2';
    if (count === 3) return 'grid-cols-1 min-[400px]:grid-cols-3';
    return 'grid-cols-2 lg:grid-cols-4';
}

const RevenueAtRiskWidget: React.FC = () => {
    const navigate = useNavigate();
    const { kpiSummary, revenueAtRiskSeries, hasData } = useDashboardStore();

    if (!hasData || !kpiSummary) return (
        <div className="flex flex-col items-center justify-center min-h-[320px] xl:flex-1 w-full p-6 sm:p-8 bg-transparent">
            <div className="flex flex-col items-center justify-center text-center max-w-sm">
                <div className="p-3 rounded-none bg-gray-100 text-gray-500 mb-4">
                    <Database size={28} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-sans font-bold text-gray-800 mb-1">Connect data sources</p>
                <p className="text-xs font-mono text-gray-500 mb-5 leading-relaxed">
                    Connect your sales and traffic data to see revenue at risk and insights based on ingested data.
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard/sources')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white font-mono text-xs font-bold tracking-widest uppercase hover:bg-gray-800 transition-colors"
                >
                    Go to Sources <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );

    const revDelta = kpiSummary.revenueDeltaPercent ?? 0;
    const isNegative = revDelta < 0;
    const rarTotal = kpiSummary.revenueAtRiskTotal ?? 0;
    const decomp = kpiSummary.rarDecomposition;

    const chartData = revenueAtRiskSeries.map(d => {
        const dateObj = new Date(d.date);
        return {
            date: isNaN(dateObj.getTime()) ? d.date : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateObj),
            value: d.revenue,
            traffic: d.traffic,
            orders: d.orders,
        };
    });

    const decompEntries = decomp ? [
        { key: 'inventory', label: 'Inventory', value: decomp.inventoryLeak, color: '#DC2626', icon: Package },
        { key: 'conversion', label: 'Conversion', value: decomp.conversionLeak, color: '#7C3AED', icon: TrendingDown },
        { key: 'ops', label: 'Operations', value: decomp.opsLeak, color: '#CA8A04', icon: Truck },
        { key: 'channel', label: 'Channel Mix', value: decomp.channelMixLeak, color: '#2563EB', icon: BarChart3 },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value) : [];

    const kpis = [
        { label: 'Total Orders', val: kpiSummary.totalOrders.toLocaleString(), delta: kpiSummary.ordersDelta, sf: '' },
        { label: 'Avg Order Value', val: `₹${kpiSummary.avgOrderValue}`, delta: kpiSummary.aovDelta, sf: '₹' },
        { label: 'OOS Rate', val: `${kpiSummary.oosRate}%`, delta: kpiSummary.oosDelta, sf: '%', invert: true },
        { label: 'Return Rate', val: `${kpiSummary.returnRate}%`, delta: kpiSummary.returnDelta, sf: '%', invert: true },
    ];

    return (
        <div className="flex flex-col w-full xl:h-full xl:overflow-y-auto custom-scrollbar">
            {/* KPI Section */}
            <div className="shrink-0 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100/80 border-b border-gray-100/80">
                {/* Primary: Total Revenue */}
                <div className="w-full lg:w-[38%] bg-white p-5 xl:p-6 flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
                    <div className="text-[11px] font-mono font-bold tracking-widest text-gray-400 uppercase mb-2 relative z-10">Total Revenue</div>
                    <div className="text-3xl xl:text-4xl font-sans font-black tracking-tight text-gray-900 relative z-10 mb-2 leading-none">₹{formatNum(kpiSummary.totalRevenue)}</div>
                    <div className={`text-[11px] font-mono font-bold flex items-center gap-1.5 relative z-10 ${isNegative ? 'text-red-500' : 'text-emerald-500'}`}>
                        {isNegative ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                        {Math.abs(revDelta).toFixed(1)}% vs last period
                    </div>
                </div>

                {/* Secondary KPIs — 2x2 grid with gap borders */}
                <div className="w-full lg:w-[62%] grid grid-cols-2 gap-px bg-gray-100/60">
                    {kpis.map((kpi, i) => {
                        const isGood = kpi.invert ? kpi.delta <= 0 : kpi.delta >= 0;
                        return (
                            <div key={i} className="bg-white p-4 xl:p-5 flex flex-col justify-center">
                                <div className="text-[11px] font-mono font-bold tracking-widest text-gray-400 uppercase mb-1.5 leading-none">{kpi.label}</div>
                                <div className="text-xl xl:text-2xl font-sans font-black text-gray-900 leading-none mb-1.5">{kpi.val}</div>
                                <div className={`text-[11px] font-mono font-bold flex items-center gap-1 ${isGood ? 'text-emerald-500' : 'text-red-500'} leading-none`}>
                                    {isGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {Math.abs(kpi.delta)}{kpi.sf} WoW
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Revenue at Risk Drivers */}
            {rarTotal > 0 && decompEntries.length > 0 && (
                <div className="shrink-0 p-4 sm:p-5 border-b border-gray-100/80 bg-red-50/20 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="p-1 bg-red-100 text-red-600">
                                <AlertCircle size={14} />
                            </div>
                            <span className="text-xs sm:text-sm font-sans font-black text-gray-900 tracking-tight uppercase">Revenue at Risk</span>
                        </div>
                        <span className="text-base sm:text-lg font-mono font-black text-red-600 bg-red-50 px-2.5 py-0.5 border border-red-100">
                            ₹{formatNum(rarTotal)}
                        </span>
                    </div>

                    <div className={`grid w-full gap-2.5 relative z-10 items-stretch ${driverRiskGridClass(decompEntries.length)}`}>
                        {decompEntries.map(entry => {
                            const Icon = entry.icon;
                            const perc = ((entry.value / rarTotal) * 100).toFixed(0);
                            return (
                                <div key={entry.key} className="bg-white/60 border border-red-50 p-3 relative overflow-hidden group/driver transition-colors hover:bg-white/80 min-w-0 flex flex-col h-full">
                                    <div className="absolute left-0 top-0 w-[3px] h-full transition-all group-hover/driver:w-1" style={{ backgroundColor: entry.color }} />
                                    <div className="pl-2 flex items-center justify-between">
                                        <Icon size={14} style={{ color: entry.color }} />
                                        <span className="text-sm font-mono font-black text-gray-900">₹{formatNum(entry.value)}</span>
                                    </div>
                                    <div className="pl-2 mt-2 flex items-center justify-between">
                                        <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-gray-500">{entry.label}</span>
                                        <span className="text-[11px] font-mono font-bold" style={{ color: entry.color }}>{perc}%</span>
                                    </div>
                                    <div className="relative mt-auto pt-2 -mx-3 h-1 bg-gray-200 overflow-hidden shrink-0">
                                        <div
                                            className="absolute left-0 top-0 bottom-0 h-full transition-all duration-500"
                                            style={{ width: `${perc}%`, backgroundColor: entry.color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Revenue Timeline Chart */}
            <div className="p-4 h-[280px] sm:h-[320px] xl:h-auto xl:flex-1 xl:min-h-[240px] flex flex-col relative z-0 overflow-hidden">
                <div className="flex items-center justify-between mb-3 shrink-0">
                    <h3 className="text-xs sm:text-sm font-sans font-black text-gray-900 tracking-tight uppercase">Revenue Timeline</h3>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500 uppercase font-bold">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" /> Revenue
                    </div>
                </div>
                <div className="flex-1 w-full relative -ml-4 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'monospace' }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#9ca3af', fontFamily: 'monospace' }}
                                tickFormatter={(val) => `₹${formatNum(val)}`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '0px', color: '#fff', fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Revenue']}
                                labelStyle={{ color: '#9ca3af', marginBottom: '4px' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#6366f1"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorRevenue)"
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

function formatNum(n: number): string {
    if (n >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default RevenueAtRiskWidget;
