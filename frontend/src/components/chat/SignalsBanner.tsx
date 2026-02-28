import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, AlertTriangle, Activity, TrendingDown, Zap, ExternalLink } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useNavigate } from 'react-router-dom';

const SignalsBanner: React.FC<{ collapsed?: boolean }> = ({ collapsed: externalCollapsed }) => {
    const { liveSignals, kpiSummary, hasData, fetchDashboard } = useDashboardStore();
    const navigate = useNavigate();
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    useEffect(() => {
        if (externalCollapsed !== undefined) setIsCollapsed(externalCollapsed);
    }, [externalCollapsed]);

    if (!hasData) return null;

    const revDelta = kpiSummary?.revenueDeltaPercent ?? 0;
    const criticalCount = liveSignals.filter(s => s.severity === 'critical').length;
    const totalSignals = liveSignals.length;

    const severityIcon = (severity: string) => {
        switch (severity) {
            case 'critical': return <AlertTriangle size={12} />;
            case 'high': return <Activity size={12} />;
            default: return <Zap size={12} />;
        }
    };

    const severityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-50 text-red-700 border-red-200';
            case 'high': return 'bg-orange-50 text-orange-700 border-orange-200';
            case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200';
            default: return 'bg-blue-50 text-blue-700 border-blue-200';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-3xl mx-auto mb-4"
        >
            <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 shadow-sm overflow-hidden">
                {/* Summary Bar — Always visible */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
                >
                    <div className="flex items-center gap-4 text-xs font-mono">
                        <div className="flex items-center gap-2">
                            <TrendingDown size={14} className={revDelta < 0 ? 'text-orange-500' : 'text-green-600'} />
                            <span className="text-gray-500">REVENUE</span>
                            <span className={`font-semibold ${revDelta < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                {revDelta > 0 ? '+' : ''}{revDelta.toFixed(0)}% WoW
                            </span>
                        </div>
                        <div className="w-px h-4 bg-gray-200" />
                        <div className="flex items-center gap-2">
                            {criticalCount > 0 && (
                                <span className="flex items-center gap-1 text-red-600">
                                    <AlertTriangle size={12} />
                                    <span className="font-semibold">{criticalCount}</span>
                                </span>
                            )}
                            <span className="text-gray-500">{totalSignals} SIGNAL{totalSignals !== 1 ? 'S' : ''}</span>
                        </div>
                        {kpiSummary && (
                            <>
                                <div className="w-px h-4 bg-gray-200 hidden md:block" />
                                <span className="text-gray-400 hidden md:inline">₹{formatNum(kpiSummary.totalRevenue)}</span>
                            </>
                        )}
                    </div>
                    <div className="text-gray-400">
                        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </div>
                </button>

                {/* Expanded Signals */}
                <AnimatePresence>
                    {!isCollapsed && totalSignals > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <div className="px-4 pb-3 pt-1">
                                <div className="flex flex-wrap gap-2">
                                    {liveSignals.slice(0, 6).map((signal: any) => (
                                        <button
                                            key={signal.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/dashboard/signals/${signal.id}`);
                                            }}
                                            className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] border transition-all hover:shadow-sm active:scale-95 ${severityColor(signal.severity)}`}
                                        >
                                            {severityIcon(signal.severity)}
                                            <span className="truncate max-w-[200px]">{signal.title}</span>
                                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                        </button>
                                    ))}
                                    {totalSignals > 6 && (
                                        <span className="inline-flex items-center px-2.5 py-1.5 text-[11px] text-gray-400 font-mono">
                                            +{totalSignals - 6} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default SignalsBanner;
