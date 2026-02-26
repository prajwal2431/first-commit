import React from 'react';
import { LineChart, Line, XAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Instagram, Box } from 'lucide-react';
import GridCard from '@/components/ui/GridCard';
import type { RootCause } from '@/types';

interface RootCauseCardProps {
    rootCause: RootCause;
}

const EXTERNAL_FACTORS = [
    { time: '10AM', social_hype: 20, inventory: 100 },
    { time: '2PM', social_hype: 45, inventory: 60 },
    { time: '6PM', social_hype: 95, inventory: 0 },
    { time: '10PM', social_hype: 88, inventory: 0 },
];

const RootCauseCard: React.FC<RootCauseCardProps> = ({ rootCause }) => {
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
                                {/* Using generic icons based on title for the mock data, in a real app this would map from factor.icon */}
                                {factor.title.toLowerCase().includes('viral') ? (
                                    <Instagram className="w-5 h-5 mt-1 text-pink-600 shrink-0" />
                                ) : (
                                    <Box className="w-5 h-5 mt-1 text-blue-600 shrink-0" />
                                )}
                                <div>
                                    <h4 className="font-bold text-sm">{factor.title}</h4>
                                    <p className="text-sm text-gray-600">{factor.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-full lg:w-1/2 bg-white border border-gray-100 p-4 shadow-sm">
                    <h4 className="font-mono text-[10px] text-gray-500 mb-4 uppercase">Social Hype vs. Inventory Levels</h4>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={EXTERNAL_FACTORS}>
                            <CartesianGrid stroke="#f0f0f0" vertical={false} />
                            <XAxis dataKey="time" hide />
                            <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '0px', border: '1px solid #E5E5E5', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Line type="step" dataKey="social_hype" stroke="#E1306C" strokeWidth={2} dot={false} name="Social Vol." />
                            <Line type="monotone" dataKey="inventory" stroke="#121212" strokeWidth={2} dot={false} name="Stock Level" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </GridCard>
    );
};

export default RootCauseCard;
