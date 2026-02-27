import React from 'react';
import { LineChart, Line, XAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, Box, TrendingDown, Truck } from 'lucide-react';
import GridCard from '@/components/ui/GridCard';
import type { RootCause } from '@/types';
import { useDiagnosisStore } from '@/stores/diagnosisStore';

interface RootCauseCardProps {
    rootCause: RootCause;
}

const ICON_MAP: Record<string, React.ReactNode> = {
    alert: <AlertTriangle className="w-5 h-5 mt-1 text-orange-600 shrink-0" />,
    box: <Box className="w-5 h-5 mt-1 text-blue-600 shrink-0" />,
    truck: <Truck className="w-5 h-5 mt-1 text-green-600 shrink-0" />,
};

const RootCauseCard: React.FC<RootCauseCardProps> = ({ rootCause }) => {
    const { chartData } = useDiagnosisStore();

    const hasChartData = chartData.revenueVsTraffic.length > 0;
    const displayChart = hasChartData
        ? chartData.revenueVsTraffic.slice(-14).map((d) => ({
            time: d.date.slice(5),
            revenue: d.revenue,
            traffic: d.traffic,
        }))
        : [];

    return (
        <GridCard colSpan="col-span-12 xl:col-span-8" title={rootCause.title} meta={`CONFIDENCE: ${(rootCause.confidenceScore * 100).toFixed(0)}%`} className="border border-gray-200/60">
            <div className="flex flex-col lg:flex-row gap-8 mt-4">
                <div className="flex-1 space-y-6">
                    <p className="text-2xl font-light leading-snug">
                        {rootCause.description}
                    </p>
                    <div className="space-y-4">
                        {rootCause.contributingFactors.map((factor, idx) => (
                            <div key={idx} className="flex gap-4 items-start">
                                {ICON_MAP[factor.icon] ?? <TrendingDown className="w-5 h-5 mt-1 text-gray-600 shrink-0" />}
                                <div>
                                    <h4 className="font-bold text-sm">{factor.title}</h4>
                                    <p className="text-sm text-gray-600">{factor.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {hasChartData && (
                    <div className="w-full lg:w-1/2 bg-white border border-gray-100 p-4 shadow-sm">
                        <h4 className="font-mono text-[10px] text-gray-500 mb-4 uppercase">Revenue vs. Traffic Trend</h4>
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={displayChart}>
                                <CartesianGrid stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="time" hide />
                                <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '0px', border: '1px solid #E5E5E5', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Line type="monotone" dataKey="traffic" stroke="#7C3AED" strokeWidth={2} dot={false} name="Traffic" />
                                <Line type="monotone" dataKey="revenue" stroke="#121212" strokeWidth={2} dot={false} name="Revenue" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </GridCard>
    );
};

export default RootCauseCard;
