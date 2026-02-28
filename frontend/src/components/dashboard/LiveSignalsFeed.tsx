import React from 'react';
import GridCard from '@/components/ui/GridCard';
import AlertItem from './AlertItem';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '@/stores/dashboardStore';

const LiveSignalsFeed: React.FC = () => {
    const navigate = useNavigate();
    const { liveSignals, hasData } = useDashboardStore();

    const handleAlertClick = (signalId: string) => {
        navigate(`/dashboard/signals/${signalId}`);
    };

    if (!hasData || liveSignals.length === 0) {
        return (
            <GridCard colSpan="col-span-12 lg:col-span-4" title="Live Signals" className="border border-gray-200/60">
                <div className="flex items-center justify-center h-40 text-gray-400">
                    <div className="text-center">
                        <p className="text-sm font-serif italic">No signals detected</p>
                        <p className="text-xs font-mono mt-1">Signals appear when anomalies are found in your data</p>
                    </div>
                </div>
            </GridCard>
        );
    }

    const severityToLevel = (s: string): 'critical' | 'warning' | 'info' => {
        if (s === 'critical') return 'critical';
        if (s === 'high') return 'warning';
        return 'info';
    };

    const formatTime = (dateStr: string): string => {
        const d = new Date(dateStr);
        const now = Date.now();
        const diff = now - d.getTime();
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    };

    return (
        <GridCard colSpan="col-span-12 lg:col-span-4" title="Live Signals" meta={`${liveSignals.length} ACTIVE`} className="border border-gray-200/60">
            <div className="space-y-4 mt-2 max-h-80 overflow-y-auto">
                {liveSignals.slice(0, 10).map((signal: any) => (
                    <AlertItem
                        key={signal.id}
                        level={severityToLevel(signal.severity)}
                        msg={signal.title}
                        time={formatTime(signal.detectedAt)}
                        onClick={() => handleAlertClick(signal.id)}
                    />
                ))}
            </div>
        </GridCard>
    );
};

export default LiveSignalsFeed;
