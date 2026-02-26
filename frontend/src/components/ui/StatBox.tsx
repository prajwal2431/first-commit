import React from 'react';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatBoxProps {
    label: string;
    value: string;
    sub?: string;
    trend?: 'up' | 'down';
    color?: string;
}

const StatBox: React.FC<StatBoxProps> = ({ label, value, sub, trend, color = 'text-gray-900' }) => (
    <div className="bg-white p-4 border border-gray-100 flex flex-col justify-between group hover:border-gray-200 transition-colors shadow-sm">
        <div className="flex justify-between items-start">
            <span className="font-mono text-[10px] text-gray-400 uppercase tracking-wider">{label}</span>
            {trend && <TrendingUp size={14} className={trend === 'up' ? 'text-red-500' : 'text-green-500'} />}
        </div>
        <div>
            <div className={cn("text-2xl font-serif", color)}>{value}</div>
            {sub && <div className="text-[10px] text-gray-500 mt-1">{sub}</div>}
        </div>
    </div>
);

export default StatBox;
