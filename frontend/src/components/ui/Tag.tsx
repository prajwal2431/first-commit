import React from 'react';
import { cn } from '@/lib/utils';

interface TagProps {
    children: React.ReactNode;
    type?: 'neutral' | 'alert' | 'success' | 'purple';
}

const Tag: React.FC<TagProps> = ({ children, type = 'neutral' }) => {
    const colors = {
        neutral: 'bg-gray-100 text-gray-600 border-gray-200',
        alert: 'bg-orange-50 text-orange-600 border-orange-200',
        success: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        purple: 'bg-violet-50 text-violet-600 border-violet-200',
    };

    return (
        <span className={cn(
            "px-2 py-1 text-[10px] uppercase tracking-wider font-mono border",
            colors[type]
        )}>
            {children}
        </span>
    );
};

export default Tag;
