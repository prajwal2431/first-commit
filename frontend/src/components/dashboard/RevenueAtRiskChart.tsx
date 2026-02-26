import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import GridCard from '@/components/ui/GridCard';

const SALES_DATA_ANOMALY = [
    { day: 'Mon', sales: 4200, traffic: 4500 },
    { day: 'Tue', sales: 4800, traffic: 5000 },
    { day: 'Wed', sales: 5500, traffic: 6000 },
    { day: 'Thu', sales: 2200, traffic: 12000 },
    { day: 'Fri', sales: 1500, traffic: 14500 },
    { day: 'Sat', sales: 1200, traffic: 13000 },
    { day: 'Sun', sales: 1000, traffic: 11000 },
];

const RevenueAtRiskChart: React.FC = () => {
    return (
        <GridCard colSpan="col-span-12 lg:col-span-8" title="Revenue at Risk" meta="DROP DETECTED" className="border border-gray-200/60">
            <div className="flex flex-col md:flex-row items-end gap-8 h-full">
                <div className="flex-1 w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={SALES_DATA_ANOMALY}>
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
                        <div className="text-4xl font-serif text-orange-500">-42%</div>
                        <div className="text-xs font-mono text-gray-500 uppercase">Rev vs Traffic Gap</div>
                    </div>
                    <div className="text-sm text-gray-600 leading-relaxed">
                        Critical diversion in <span className="font-semibold border-b border-black">Disney x Bonkers</span> collection. High traffic (Viral trend) meeting Zero Inventory in North Region.
                    </div>
                </div>
            </div>
        </GridCard>
    );
};

export default RevenueAtRiskChart;
