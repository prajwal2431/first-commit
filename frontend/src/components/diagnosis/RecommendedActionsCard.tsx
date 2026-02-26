import React from 'react';
import GridCard from '@/components/ui/GridCard';
import ActionItem from './ActionItem';
import type { Action } from '@/types';

interface RecommendedActionsCardProps {
    actions: Action[];
}

const RecommendedActionsCard: React.FC<RecommendedActionsCardProps> = ({ actions }) => {
    return (
        <GridCard colSpan="col-span-12 md:col-span-6" title="Recommended Actions" meta="AI GENERATED" className="border border-gray-200/60">
            <ul className="space-y-3 mt-2">
                {actions.map((action) => (
                    <ActionItem
                        key={action.id}
                        action={action}
                    />
                ))}
            </ul>
        </GridCard>
    );
};

export default RecommendedActionsCard;
