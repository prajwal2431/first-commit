import React from 'react';
import GridCard from '@/components/ui/GridCard';
import StatBox from '@/components/ui/StatBox';
import type { ImpactMetrics } from '@/types';

interface BusinessImpactCardProps {
    metrics: ImpactMetrics;
}

const BusinessImpactCard: React.FC<BusinessImpactCardProps> = ({ metrics }) => {
    return (
        <GridCard colSpan="col-span-12 xl:col-span-4" title="Business Impact" meta="REAL-TIME" className="border border-gray-200/60">
            <div className="grid grid-cols-2 gap-4 mt-2 h-full">
                <StatBox label="Lost Rev" value={metrics.lostRevenue.value} trend={metrics.lostRevenue.trend} color="text-orange-600" />
                <StatBox label="Conversion" value={metrics.conversion.value} trend={metrics.conversion.trend} color="text-red-600" />
                <StatBox label="Stock @ HQ" value={metrics.stockHQ.value} sub={metrics.stockHQ.sub} color="text-gray-900" />
                <StatBox label="Stock @ DEL" value={metrics.stockTarget.value} sub={metrics.stockTarget.sub} color="text-red-600" />
            </div>
        </GridCard>
    );
};

export default BusinessImpactCard;
