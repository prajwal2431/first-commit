import React from 'react';
import { Globe, ArrowRight } from 'lucide-react';
import GridCard from '@/components/ui/GridCard';
import type { GeographicInsight } from '@/types';

interface GeographicOpportunityCardProps {
    data: GeographicInsight;
}

const GeographicOpportunityCard: React.FC<GeographicOpportunityCardProps> = ({ data }) => {
    return (
        <GridCard colSpan="col-span-12 md:col-span-6" title="Geographic Opportunity" meta="INVENTORY MAP" className="border border-gray-200/60">
            <div className="h-full flex flex-col mt-2">
                <p className="text-sm text-gray-600 mb-4">
                    {data.narrative}
                </p>
                <div className="flex-1 bg-gray-50 border border-gray-100 relative overflow-hidden flex items-center justify-center min-h-[160px]">
                    <Globe className="text-gray-200 w-32 h-32 absolute" />
                    <div className="z-10 bg-white p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-4">
                        <div className="text-center">
                            <div className="text-xs font-mono text-gray-400 uppercase">{data.origin.label}</div>
                            <div className="text-emerald-500 font-bold">{data.origin.status}</div>
                        </div>
                        <ArrowRight className="text-gray-300 hidden sm:block" />
                        <div className="text-center">
                            <div className="text-xs font-mono text-gray-400 uppercase">{data.destination.label}</div>
                            <div className="text-red-500 font-bold">{data.destination.status}</div>
                        </div>
                    </div>
                </div>
            </div>
        </GridCard>
    );
};

export default GeographicOpportunityCard;
