import React from 'react';
import { AlertTriangle, Activity, Database, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertItemProps {
    level: 'critical' | 'warning' | 'info';
    msg: string;
    time: string;
    onClick: () => void;
}

const AlertItem: React.FC<AlertItemProps> = ({ level, msg, time, onClick }) => {
    const colors = {
        critical: 'bg-red-50 text-red-700 border-red-100',
        warning: 'bg-orange-50 text-orange-700 border-orange-100',
        info: 'bg-blue-50 text-blue-700 border-blue-100'
    };
    const icons = {
        critical: <AlertTriangle size={14} />,
        warning: <Activity size={14} />,
        info: <Database size={14} />
    };

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-start gap-3 p-3 border transition-all hover:translate-x-1 cursor-pointer hover:shadow-sm active:scale-95 group",
                colors[level]
            )}
        >
            <div className="mt-0.5">{icons[level]}</div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-snug truncate whitespace-normal">{msg}</p>
                <p className="text-[10px] opacity-70 mt-1 font-mono uppercase">{time}</p>
            </div>
            <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all text-current shrink-0" />
        </div>
    );
};

export default AlertItem;
