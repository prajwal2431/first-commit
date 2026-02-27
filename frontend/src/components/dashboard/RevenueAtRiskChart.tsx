import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import GridCard from '@/components/ui/GridCard';
import { useDashboardStore } from '@/stores/dashboardStore';

const RevenueAtRiskChart: React.FC = () => {
    const { revenueAtRiskSeries, kpiSummary, hasData } = useDashboardStore();

    if (!hasData || revenueAtRiskSeries.length === 0) {
        return (
            <GridCard colSpan="col-span-12 lg:col-span-8" title="Revenue at Risk" className="border border-gray-200/60">
                <div className="flex items-center justify-center h-64 text-gray-400">
                    <div className="text-center">
                        <p className="text-lg font-serif italic">No data yet</p>
                        <p className="text-xs font-mono mt-2">Upload sales data through the Sources page to see revenue insights</p>
                    </div>
                </div>
            </GridCard>
        );
    }

    const chartData = revenueAtRiskSeries.map((d) => ({
        day: d.date.slice(5),
        sales: d.revenue,
        traffic: d.traffic,
    }));

    const revGapPercent = kpiSummary?.revenueDeltaPercent ?? 0;
    const hasAnomaly = revGapPercent < -10;

    return (
        <GridCard
            colSpan="col-span-12 lg:col-span-8"
            title="Revenue at Risk"
            meta={hasAnomaly ? 'DROP DETECTED' : undefined}
            className="border border-gray-200/60"
        >
            <div className="flex flex-col md:flex-row items-end gap-8 h-full">
                <div className="flex-1 w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                            <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.9)', border: '1px solid #eee', fontFamily: 'JetBrains Mono', borderRadius: '0px' }} />
                            <Area type="monotone" dataKey="traffic" stroke="#7C3AED" strokeWidth={2} fillOpacity={1} fill="url(#colorTraffic)" name="Web Traffic" />
                            <Area type="monotone" dataKey="sales" stroke="#121212" strokeWidth={2} fill="transparent" strokeDasharray="5 5" name="Revenue" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="w-full md:w-64 space-y-4 mb-4">
                    <div>
                        <div className={`text-4xl font-serif ${revGapPercent < 0 ? 'text-orange-500' : 'text-green-600'}`}>
                            {revGapPercent > 0 ? '+' : ''}{revGapPercent.toFixed(0)}%
                        </div>
                        <div className="text-xs font-mono text-gray-500 uppercase">Rev vs Prior Week</div>
                    </div>
                    {kpiSummary && (
                        <div className="text-sm text-gray-600 leading-relaxed space-y-1">
                            <p>Revenue: <span className="font-semibold">₹{formatNum(kpiSummary.totalRevenue)}</span></p>
                            <p>Orders: <span className="font-semibold">{kpiSummary.totalOrders.toLocaleString()}</span></p>
                            <p>AOV: <span className="font-semibold">₹{kpiSummary.avgOrderValue}</span></p>
                        </div>
                    )}
                </div>
            </div>
        </GridCard>
    );
};

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default RevenueAtRiskChart;
