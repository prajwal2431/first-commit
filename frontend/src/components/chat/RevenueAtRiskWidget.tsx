import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, TrendingDown, Package, Truck, BarChart3, TrendingUp, Database, ArrowRight } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const RevenueAtRiskWidget: React.FC = () => {
    const navigate = useNavigate();
    const { kpiSummary, revenueAtRiskSeries, hasData } = useDashboardStore();

    if (!hasData || !kpiSummary) return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 bg-transparent">
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

    // Prepare chart data for main AreaChart
    const chartData = revenueAtRiskSeries.map(d => {
        const dateObj = new Date(d.date);
        return {
            date: isNaN(dateObj.getTime()) ? d.date : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dateObj),
            value: d.revenue,
            traffic: d.traffic,
            orders: d.orders,
        };
    });

    // Build decomposition items
    const decompEntries = decomp ? [
        { key: 'inventory', label: 'Inventory', value: decomp.inventoryLeak, color: '#DC2626', icon: Package },
        { key: 'conversion', label: 'Conversion', value: decomp.conversionLeak, color: '#7C3AED', icon: TrendingDown },
        { key: 'ops', label: 'Operations', value: decomp.opsLeak, color: '#CA8A04', icon: Truck },
        { key: 'channel', label: 'Channel Mix', value: decomp.channelMixLeak, color: '#2563EB', icon: BarChart3 },
    ].filter(d => d.value > 0).sort((a, b) => b.value - a.value) : [];

    return (
        <div className="flex flex-col w-full h-full overflow-hidden min-h-0">
            {/* KPI Section */}
            <div className="flex flex-col lg:flex-row border-b border-gray-100/80 divide-y lg:divide-y-0 lg:divide-x divide-gray-100/80 bg-transparent shrink-0">
                {/* Main Revenue Card */}
                <div className="w-full lg:w-[40%] bg-transparent p-5 xl:p-6 flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
                    <div className="text-[10px] font-mono font-bold tracking-widest text-gray-400 uppercase mb-2 relative z-10">Total Revenue</div>
                    <div className="text-3xl xl:text-4xl font-sans font-black tracking-tight text-gray-900 relative z-10 mb-2 leading-none">₹{formatNum(kpiSummary.totalRevenue)}</div>
                    <div className={`text-[10px] xl:text-xs font-mono font-bold flex items-center gap-1.5 relative z-10 ${isNegative ? 'text-red-500' : 'text-emerald-500'}`}>
                        {isNegative ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                        {Math.abs(revDelta).toFixed(1)}% vs last period
                    </div>
                </div>

                {/* Other KPIs Grid (2x2) */}
                <div className="w-full lg:w-[60%] grid grid-cols-2">
                    {[
                        { label: 'Total Orders', val: kpiSummary.totalOrders.toLocaleString(), delta: kpiSummary.ordersDelta, sf: '', classes: 'border-b border-r border-gray-100/80' },
                        { label: 'Avg Order Val', val: `₹${kpiSummary.avgOrderValue}`, delta: kpiSummary.aovDelta, sf: '₹', classes: 'border-b border-gray-100/80' },
                        { label: 'OOS Rate', val: `${kpiSummary.oosRate}%`, delta: kpiSummary.oosDelta, sf: '%', invert: true, classes: 'border-r border-gray-100/80' },
                        { label: 'Return Rate', val: `${kpiSummary.returnRate}%`, delta: kpiSummary.returnDelta, sf: '%', invert: true, classes: '' },
                    ].map((kpi, i) => {
                        const isGood = kpi.invert ? kpi.delta <= 0 : kpi.delta >= 0;
                        return (
                            <div key={i} className={`bg-transparent p-4 xl:p-5 flex flex-col justify-center relative ${kpi.classes}`}>
                                <div className="text-[9px] xl:text-[10px] font-mono font-bold tracking-widest text-gray-400 uppercase mb-1.5 leading-none">{kpi.label}</div>
                                <div className="text-xl xl:text-2xl font-sans font-black text-gray-900 leading-none mb-1.5">{kpi.val}</div>
                                <div className={`text-[9px] xl:text-[10px] font-mono font-bold flex items-center gap-1 uppercase tracking-wider ${isGood ? 'text-emerald-500' : 'text-red-500'} leading-none`}>
                                    {isGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {Math.abs(kpi.delta)}{kpi.sf} WoW
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Decomposition Row (Appears right below Top KPIs to show immediate risks) */}
            {rarTotal > 0 && decompEntries.length > 0 && (
                <div className="bg-red-50/10 border-b border-gray-100/80 p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="flex items-center justify-between mb-5 relative z-10">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-red-100 text-red-600 rounded-none">
                                <AlertCircle size={16} />
                            </div>
                            <span className="text-sm font-sans font-black text-gray-900 tracking-tight uppercase">Revenue at Risk Drivers</span>
                        </div>
                        <span className="text-xl font-mono font-black text-red-600 bg-red-50 px-3 py-1 border border-red-100">
                            ₹{formatNum(rarTotal)} IMPACT
                        </span>
                    </div>

                    {/* Horizontal Driver Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
                        {decompEntries.map(entry => {
                            const Icon = entry.icon;
                            // Calculate percentage rounded to 1 decimal
                            const perc = ((entry.value / rarTotal) * 100).toFixed(1);

                            return (
                                <div key={entry.key} className="bg-white/50 border border-red-50 rounded-none p-2.5 relative overflow-hidden group transition-colors">
                                    <div className="absolute left-0 top-0 w-1 h-full transition-all group-hover:w-1.5" style={{ backgroundColor: entry.color }} />
                                    <div className="flex items-center justify-between">
                                        <div className="p-1.5 bg-white rounded-none shadow-sm">
                                            <Icon size={14} style={{ color: entry.color }} />
                                        </div>
                                        <span className="text-sm font-mono font-black text-gray-900">₹{formatNum(entry.value)}</span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-[10px] font-mono font-bold tracking-widest uppercase">
                                        <span className="text-gray-500">{entry.label}</span>
                                        <span style={{ color: entry.color }}>{perc}%</span>
                                    </div>
                                    <div className="w-full h-1 bg-gray-200 mt-1.5 overflow-hidden">
                                        <div className="h-full" style={{ width: `${perc}%`, backgroundColor: entry.color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Large Chart Area */}
            <div className="bg-transparent p-4 flex-1 min-h-0 flex flex-col relative z-0">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-sans font-black text-gray-900 tracking-tight uppercase">Revenue Timeline</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 uppercase font-bold">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" /> Revenue
                        </div>
                    </div>
                </div>
                <div className="flex-1 w-full relative -ml-4">
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
                                contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '0px', color: '#fff', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }}
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
