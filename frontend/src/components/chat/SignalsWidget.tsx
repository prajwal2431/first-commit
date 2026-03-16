import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Shield, ArrowRight, Activity } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useNavigate } from 'react-router-dom';

const SignalsWidget: React.FC = () => {
    const { liveSignals, hasData } = useDashboardStore();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['critical', 'high']);

    if (!hasData || liveSignals.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 bg-transparent transition-all group relative overflow-hidden">
            <div className="flex flex-col items-center justify-center text-center max-w-sm z-10">
                <div className="p-3 rounded-none bg-gray-100 text-gray-500 mb-4">
                    <Activity size={28} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-sans font-bold text-gray-800 mb-1">Connect data sources</p>
                <p className="text-xs font-mono text-gray-500 mb-5 leading-relaxed">
                    Ingest data to get live signals and anomaly alerts. Signals appear when we detect issues in your revenue or operations.
                </p>
                <button
                    type="button"
                    onClick={() => navigate('/dashboard/sources')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white font-mono text-xs font-bold tracking-widest uppercase hover:bg-gray-800 transition-colors"
                >
                    Go to Sources <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev =>
            prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
        );
    };

    // Aggregate total impact
    const totalImpact = liveSignals.reduce((sum, s) => {
        return sum + (s.impact?.revenueAtRisk ?? s.impact?.marginAtRisk ?? 0);
    }, 0);

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

    const criticalItems = activeSignals.filter(s => s.severity === 'critical');
    const highItems = activeSignals.filter(s => s.severity === 'high');
    const mediumItems = activeSignals.filter(s => s.severity === 'medium' || s.severity === 'low');

    return (
        <div className="flex flex-col h-full bg-transparent p-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
            {/* Header with total impact */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold tracking-widest text-gray-400 uppercase">Live Signals ({liveSignals.length})</span>
                {totalImpact > 0 && (
                    <span className="text-xs font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 border border-red-100/50">
                        ₹{formatNum(totalImpact)} IMPACT
                    </span>
                )}
            </div>

            {/* Severity Breakdown Bar */}
            <div className="flex items-center gap-1 mb-4">
                <div className="h-1.5 flex-1 bg-gray-100 overflow-hidden flex">
                    <div style={{ width: `${(criticalItems.length / Math.max(1, liveSignals.length)) * 100}%` }} className="h-full bg-red-500" />
                    <div style={{ width: `${(highItems.length / Math.max(1, liveSignals.length)) * 100}%` }} className="h-full bg-orange-500" />
                    <div style={{ width: `${(mediumItems.length / Math.max(1, liveSignals.length)) * 100}%` }} className="h-full bg-amber-500" />
                    <div style={{ width: `${(archivedSignals.length / Math.max(1, liveSignals.length)) * 100}%` }} className="h-full bg-gray-300" />
                </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
                {(['all', 'critical', 'high', 'medium'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-[10px] sm:text-xs font-mono font-bold uppercase transition-all border px-2 py-1 rounded-none whitespace-nowrap ${filter === f ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Signals Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-4 pb-10 min-h-0">
                {(filter === 'all' || filter === 'critical') && (
                    <SignalGroup
                        id="critical"
                        title="CRITICAL INCIDENTS"
                        items={criticalItems}
                        isExpanded={expandedGroups.includes('critical')}
                        onToggle={() => toggleGroup('critical')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
                {(filter === 'all' || filter === 'high') && (
                    <SignalGroup
                        id="high"
                        title="HIGH PRIORITY"
                        items={highItems}
                        isExpanded={expandedGroups.includes('high')}
                        onToggle={() => toggleGroup('high')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
                {(filter === 'all' || filter === 'medium') && (
                    <SignalGroup
                        id="medium"
                        title="ACTIVE ANOMALIES"
                        items={mediumItems}
                        isExpanded={expandedGroups.includes('medium')}
                        onToggle={() => toggleGroup('medium')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}

                {/* Archived section at the bottom for signals > 20 */}
                {filter === 'all' && archivedSignals.length > 0 && (
                    <SignalGroup
                        id="archived"
                        title="ARCHIVED SIGNALS"
                        items={archivedSignals}
                        isExpanded={expandedGroups.includes('archived')}
                        onToggle={() => toggleGroup('archived')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
            </div>
        </div>
    );
};

const SignalGroup: React.FC<{
    id: string;
    title: string;
    items: any[];
    isExpanded: boolean;
    onToggle: () => void;
    onSignalClick: (id: string) => void;
}> = ({ id, title, items, isExpanded, onToggle, onSignalClick }) => {
    if (items.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-100/80">
            <button
                onClick={onToggle}
                className="flex items-center justify-between w-full pb-1 hover:opacity-80 transition-opacity cursor-pointer group"
            >
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${id === 'critical' ? 'bg-red-500' : id === 'high' ? 'bg-orange-500' : id === 'archived' ? 'bg-gray-400' : 'bg-amber-500'}`} />
                    <span className="text-xs font-mono font-black text-gray-900 tracking-wider bg-gray-50 px-2 py-0.5 rounded-none">{title} ({items.length})</span>
                </div>
                <div className="text-gray-400 group-hover:text-black">
                    {isExpanded ? <ChevronDown size={14} className="rotate-180" /> : <ChevronDown size={14} />}
                </div>
            </button>
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-col gap-3 overflow-hidden mt-1 pb-2"
                    >
                        {items.map((item, idx) => (
                            <motion.div
                                key={item.id}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => onSignalClick(item.id)}
                                className="relative group cursor-pointer flex flex-col gap-1 p-3 py-2.5 bg-white border border-gray-200 rounded-none shadow-sm hover:shadow-md hover:border-violet-300 transition-all duration-300"
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-none" />
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <div className={`w-2 h-2 rounded-full ${id === 'critical' ? 'bg-red-500' : id === 'high' ? 'bg-orange-500' : id === 'archived' ? 'bg-gray-400' : 'bg-amber-500'}`} />
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-tighter">{item.monitorType}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400 font-bold uppercase">{formatTime(item.detectedAt)}</span>
                                </div>
                                <h4 className="text-sm font-sans font-bold tracking-tight text-gray-900 line-clamp-2 leading-snug group-hover:text-violet-600 transition-colors duration-300">
                                    {item.title}
                                </h4>

                                {/* Impact badges */}
                                {item.impact && (
                                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                        {(item.impact.revenueAtRisk ?? 0) > 0 && (
                                            <span className="text-[10px] font-mono font-bold bg-red-50 text-red-700 px-1 py-0.5 border border-red-100">
                                                ₹{formatNum(item.impact.revenueAtRisk)} AT RISK
                                            </span>
                                        )}
                                        {(item.impact.marginAtRisk ?? 0) > 0 && (
                                            <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 px-1 py-0.5 border border-amber-100">
                                                ₹{formatNum(item.impact.marginAtRisk)} MARGIN
                                            </span>
                                        )}
                                        {item.impact.confidence > 0 && (
                                            <span className="text-[10px] font-mono font-bold bg-gray-50 text-gray-600 px-1 py-0.5 border border-gray-100 flex items-center gap-0.5">
                                                <Shield size={10} /> {item.impact.confidence}%
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Top driver */}
                                {item.impact?.drivers?.length > 0 && (
                                    <div className="text-xs font-mono text-gray-500 mt-1 truncate">
                                        ↳ {item.impact.drivers[0].driver} ({item.impact.drivers[0].contribution}%)
                                    </div>
                                )}

                                <ArrowRight size={14} className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-300 text-violet-500" />
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
}

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default SignalsWidget;
