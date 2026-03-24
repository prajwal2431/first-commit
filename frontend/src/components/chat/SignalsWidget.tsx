import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Shield, ArrowRight, Activity } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useNavigate } from 'react-router-dom';

const SEVERITY_STYLES: Record<string, { dot: string; bar: string; label: string }> = {
    critical: { dot: 'bg-red-500', bar: 'bg-red-500', label: 'CRITICAL INCIDENTS' },
    high: { dot: 'bg-orange-500', bar: 'bg-orange-500', label: 'HIGH PRIORITY' },
    medium: { dot: 'bg-amber-500', bar: 'bg-amber-500', label: 'ACTIVE ANOMALIES' },
    archived: { dot: 'bg-gray-400', bar: 'bg-gray-300', label: 'ARCHIVED SIGNALS' },
};

const SignalsWidget: React.FC = () => {
    const { liveSignals, hasData } = useDashboardStore();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['critical', 'high']);

    if (!hasData || liveSignals.length === 0) return (
        <div className="flex flex-col items-center justify-center min-h-[320px] xl:flex-1 w-full p-6 sm:p-8 bg-transparent">
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

    const totalImpact = liveSignals.reduce((sum, s) => {
        return sum + (s.impact?.revenueAtRisk ?? s.impact?.marginAtRisk ?? 0);
    }, 0);

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

    const filterCounts: Record<string, number> = {
        all: liveSignals.length,
        critical: criticalItems.length,
        high: highItems.length,
        medium: mediumItems.length,
    };

    return (
        <div className="flex flex-col xl:h-full bg-transparent p-4 sm:p-5 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                    <span className="text-xs sm:text-sm font-mono font-bold tracking-widest text-gray-500 uppercase">Signals</span>
                    <span className="text-[11px] font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5">{liveSignals.length}</span>
                </div>
                {totalImpact > 0 && (
                    <span className="text-xs sm:text-sm font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 border border-red-100/50">
                        ₹{formatNum(totalImpact)} impact
                    </span>
                )}
            </div>

            {/* Severity Distribution Bar */}
            <div className="flex items-center mb-4 shrink-0">
                <div className="h-2 flex-1 bg-gray-100 overflow-hidden flex rounded-sm min-w-0">
                    {criticalItems.length > 0 && (
                        <div style={{ flexGrow: criticalItems.length, flexBasis: 0 }} className="h-full min-w-0 bg-red-500 transition-all duration-300" />
                    )}
                    {highItems.length > 0 && (
                        <div style={{ flexGrow: highItems.length, flexBasis: 0 }} className="h-full min-w-0 bg-orange-500 transition-all duration-300" />
                    )}
                    {mediumItems.length > 0 && (
                        <div style={{ flexGrow: mediumItems.length, flexBasis: 0 }} className="h-full min-w-0 bg-amber-400 transition-all duration-300" />
                    )}
                    {archivedSignals.length > 0 && (
                        <div style={{ flexGrow: archivedSignals.length, flexBasis: 0 }} className="h-full min-w-0 bg-gray-300 transition-all duration-300" />
                    )}
                </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar shrink-0">
                {(['all', 'critical', 'high', 'medium'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-[11px] font-mono font-bold uppercase transition-all border px-2.5 py-1.5 whitespace-nowrap ${
                            filter === f
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                        }`}
                    >
                        {f} ({filterCounts[f]})
                    </button>
                ))}
            </div>

            {/* Signals List */}
            <div className="xl:flex-1 xl:overflow-y-auto xl:min-h-0 pr-1 no-scrollbar space-y-1 pb-6 xl:pb-2">
                {(filter === 'all' || filter === 'critical') && criticalItems.length > 0 && (
                    <SignalGroup
                        id="critical"
                        items={criticalItems}
                        isExpanded={expandedGroups.includes('critical')}
                        onToggle={() => toggleGroup('critical')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
                {(filter === 'all' || filter === 'high') && highItems.length > 0 && (
                    <SignalGroup
                        id="high"
                        items={highItems}
                        isExpanded={expandedGroups.includes('high')}
                        onToggle={() => toggleGroup('high')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
                {(filter === 'all' || filter === 'medium') && mediumItems.length > 0 && (
                    <SignalGroup
                        id="medium"
                        items={mediumItems}
                        isExpanded={expandedGroups.includes('medium')}
                        onToggle={() => toggleGroup('medium')}
                        onSignalClick={(id) => navigate(`/dashboard/signals/${id}`)}
                    />
                )}
                {filter === 'all' && archivedSignals.length > 0 && (
                    <SignalGroup
                        id="archived"
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
    items: any[];
    isExpanded: boolean;
    onToggle: () => void;
    onSignalClick: (id: string) => void;
}> = ({ id, items, isExpanded, onToggle, onSignalClick }) => {
    const style = SEVERITY_STYLES[id] || SEVERITY_STYLES.medium;

    return (
        <div className="flex flex-col pt-3 first:pt-0">
            {/* Group Header */}
            <button
                onClick={onToggle}
                className="flex items-center justify-between w-full py-2 px-1 hover:bg-gray-50 transition-colors cursor-pointer rounded-sm group"
            >
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${style.dot} shrink-0`} />
                    <span className="text-[11px] sm:text-xs font-mono font-black text-gray-800 tracking-wider uppercase">{style.label}</span>
                    <span className="text-[11px] font-mono font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 border border-gray-100">{items.length}</span>
                </div>
                <ChevronDown size={14} className={`text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Signal Cards */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-2.5 overflow-hidden mt-1 pb-2"
                    >
                        {items.map((item, idx) => (
                            <motion.div
                                key={item.id}
                                initial={{ x: -8, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.04 }}
                                onClick={() => onSignalClick(item.id)}
                                className="relative group cursor-pointer flex flex-col gap-1.5 p-3.5 sm:p-4 bg-white border border-gray-200 hover:border-indigo-200 hover:shadow-md transition-all duration-200"
                            >
                                {/* Severity bar — 3px left edge */}
                                <div className={`absolute left-0 top-0 w-[3px] h-full ${style.bar}`} />

                                {/* Row 1: Category + Time */}
                                <div className="flex items-center justify-between pl-2.5">
                                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">{item.monitorType}</span>
                                    <span className="text-[11px] font-mono text-gray-400 font-bold">{formatTime(item.detectedAt)}</span>
                                </div>

                                {/* Row 2: Title */}
                                <h4 className="text-[13px] sm:text-sm font-sans font-bold tracking-tight text-gray-900 line-clamp-2 leading-snug pl-2.5 group-hover:text-indigo-700 transition-colors">
                                    {item.title}
                                </h4>

                                {/* Row 3: Impact Badges */}
                                {item.impact && (
                                    <div className="flex items-center gap-2 flex-wrap pl-2.5 mt-0.5">
                                        {(item.impact.revenueAtRisk ?? 0) > 0 && (
                                            <span className="text-[11px] font-mono font-bold bg-red-50 text-red-700 px-1.5 py-0.5 border border-red-100">
                                                ₹{formatNum(item.impact.revenueAtRisk)} at risk
                                            </span>
                                        )}
                                        {(item.impact.marginAtRisk ?? 0) > 0 && (
                                            <span className="text-[11px] font-mono font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 border border-amber-100">
                                                ₹{formatNum(item.impact.marginAtRisk)} margin
                                            </span>
                                        )}
                                        {item.impact.confidence > 0 && (
                                            <span className="text-[11px] font-mono font-bold bg-gray-50 text-gray-600 px-1.5 py-0.5 border border-gray-100 flex items-center gap-0.5">
                                                <Shield size={10} /> {item.impact.confidence}%
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Row 4: Top Driver */}
                                {item.impact?.drivers?.length > 0 && (
                                    <div className="text-[11px] sm:text-xs font-mono text-gray-500 pl-2.5 mt-0.5 truncate">
                                        ↳ {item.impact.drivers[0].driver} ({item.impact.drivers[0].contribution}%)
                                    </div>
                                )}

                                <ArrowRight size={14} className="absolute bottom-3.5 right-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 text-indigo-500" />
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
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function formatNum(n: number): string {
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
}

export default SignalsWidget;
