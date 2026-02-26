import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, CheckCircle, Truck, Zap, Anchor } from 'lucide-react';
import type { Action } from '@/types';
import { cn } from '@/lib/utils';

interface ActionItemProps {
    action: Action;
}

const ActionItem: React.FC<ActionItemProps> = ({ action }) => {
    const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle');

    const handleClick = () => {
        if (status !== 'idle') return;
        setStatus('processing');

        // In a real app, this calls actionsApi.execute(action.id)
        setTimeout(() => {
            setStatus('done');
        }, 1500);
    };

    const IconComponent = () => {
        if (status === 'processing') return <Loader size={16} className="animate-spin text-black" />;
        if (status === 'done') return <CheckCircle size={16} />;

        switch (action.icon) {
            case 'truck': return <Truck size={16} />;
            case 'zap': return <Zap size={16} />;
            case 'anchor': return <Anchor size={16} />;
            default: return <CheckCircle size={16} />;
        }
    };

    return (
        <div
            onClick={handleClick}
            className={cn(
                "flex items-start gap-4 p-3 border transition-all duration-300 bg-white group relative overflow-hidden",
                status === 'done'
                    ? 'border-emerald-500 bg-emerald-50/30'
                    : 'border-gray-100 hover:border-black shadow-sm hover:shadow-md',
                status === 'idle' && 'cursor-pointer'
            )}
        >
            {status === 'processing' && (
                <motion.div
                    className="absolute inset-0 bg-gray-50 z-0"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5 }}
                />
            )}

            <div className={cn(
                "p-2 transition-colors z-10 shrink-0",
                status === 'done'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-100 group-hover:bg-black group-hover:text-white'
            )}>
                <IconComponent />
            </div>

            <div className="flex-1 z-10 min-w-0">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                    <h4 className={cn("font-bold text-sm", status === 'done' && 'text-emerald-900')}>
                        {action.title}
                    </h4>
                    {status === 'done' ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">EXECUTED</span>
                    ) : (
                        <span className={cn(
                            "text-[9px] font-mono px-1.5 py-0.5 border uppercase",
                            action.priority === 'urgent' || action.priority === 'high'
                                ? 'border-red-200 text-red-600 bg-red-50'
                                : 'border-gray-200 text-gray-600 bg-gray-50'
                        )}>
                            {action.priority}
                        </span>
                    )}
                </div>
                <p className={cn(
                    "text-xs leading-relaxed",
                    status === 'done' ? 'text-emerald-700' : 'text-gray-600'
                )}>
                    {status === 'done' ? 'Action queued for execution.' : action.description}
                </p>
            </div>
        </div>
    );
};

export default ActionItem;
