import React, { useState } from 'react';
import GridCard from '@/components/ui/GridCard';
import AlertItem from './AlertItem';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '@/stores/dashboardStore';
import { ChevronDown, ChevronRight } from 'lucide-react';

const LiveSignalsFeed: React.FC = () => {
    const navigate = useNavigate();
    const { liveSignals, hasData } = useDashboardStore();
    const [showArchived, setShowArchived] = useState(false);

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

    // Sort signals: Critical > High > Medium > Low, then by date (newest first)
    const severityPoints: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    const sortedSignals = [...liveSignals].sort((a, b) => {
        const pA = severityPoints[a.severity] || 0;
        const pB = severityPoints[b.severity] || 0;
        if (pA !== pB) return pB - pA;
        return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });

    const activeSignals = sortedSignals.slice(0, 20);
    const archivedSignals = sortedSignals.slice(20);

    const critical = activeSignals.filter(s => s.severity === 'critical');
    const high = activeSignals.filter(s => s.severity === 'high');
    const medium = activeSignals.filter(s => s.severity === 'medium' || s.severity === 'low');

    const renderGroup = (title: string, items: any[]) => {
        if (items.length === 0) return null;
        return (
            <div className="mb-4 last:mb-0">
                <h4 className="text-[10px] font-mono font-bold text-gray-500 mb-2 uppercase tracking-widest">{title} ({items.length})</h4>
                <div className="space-y-2">
                    {items.map(signal => (
                        <AlertItem
                            key={signal.id}
                            level={severityToLevel(signal.severity)}
                            msg={signal.title}
                            time={formatTime(signal.detectedAt)}
                            onClick={() => handleAlertClick(signal.id)}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <GridCard colSpan="col-span-12 lg:col-span-4" title="Live Signals" meta={`${liveSignals.length} ACTIVE`} className="border border-gray-200/60">
            <div className="mt-2 max-h-[400px] overflow-y-auto pr-1 flex flex-col no-scrollbar">
                {renderGroup('Critical', critical)}
                {renderGroup('High Priority', high)}
                {renderGroup('Active Anomalies', medium)}

                {archivedSignals.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className="flex items-center gap-1.5 w-full text-left text-xs font-mono font-bold text-gray-400 hover:text-gray-600 transition-colors uppercase tracking-widest"
                        >
                            {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Archived Signals ({archivedSignals.length})
                        </button>

                        {showArchived && (
                            <div className="space-y-2 mt-3 opacity-60">
                                {archivedSignals.map(signal => (
                                    <AlertItem
                                        key={signal.id}
                                        level={severityToLevel(signal.severity)}
                                        msg={signal.title}
                                        time={formatTime(signal.detectedAt)}
                                        onClick={() => handleAlertClick(signal.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </GridCard>
    );
};

export default LiveSignalsFeed;
