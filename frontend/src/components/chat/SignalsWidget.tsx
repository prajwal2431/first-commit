import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Activity, Zap, ExternalLink, MessageSquareCode, ChevronDown, ChevronUp } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useNavigate } from 'react-router-dom';

const SignalsWidget: React.FC = () => {
    const { liveSignals, hasData } = useDashboardStore();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['critical', 'high']);

    if (!hasData || liveSignals.length === 0) return (
        <div className="flex flex-col items-center justify-center p-8 border border-dashed border-gray-100 mt-4 h-64">
            <p className="text-[10px] font-mono text-gray-400">SIGNALS: SCANNING...</p>
            <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-full h-0.5 bg-gray-100 mt-4 overflow-hidden"
            >
                <motion.div
                    animate={{ x: [-400, 400] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-32 h-full bg-violet-400"
                />
            </motion.div>
        </div>
    );

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev =>
            prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
        );
    };

    const criticalItems = liveSignals.filter(s => s.severity === 'critical');
    const highItems = liveSignals.filter(s => s.severity === 'high');
    const mediumItems = liveSignals.filter(s => s.severity === 'medium');

    return (
        <div className="flex flex-col h-full">
            {/* Severity Breakdown Bar */}
            <div className="flex items-center justify-between mb-4 mt-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-gray-400 uppercase">Live Signals ({liveSignals.length})</span>
                <div className="flex items-center gap-1">
                    <div className="h-1.5 w-12 bg-gray-100 overflow-hidden flex">
                        <div style={{ width: `${(criticalItems.length / liveSignals.length) * 100}%` }} className="h-full bg-red-500" />
                        <div style={{ width: `${(highItems.length / liveSignals.length) * 100}%` }} className="h-full bg-orange-500" />
                        <div style={{ width: `${(mediumItems.length / liveSignals.length) * 100}%` }} className="h-full bg-amber-500" />
                    </div>
                </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 mb-6 overflow-x-auto no-scrollbar pb-1">
                {(['all', 'critical', 'high', 'medium'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`text-[9px] font-mono font-bold uppercase transition-all border px-2 py-1 rounded-none whitespace-nowrap ${filter === f ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Signals Content Area */}
            <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-8 pb-10">
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
        <div className="flex flex-col gap-3">
            <button
                onClick={onToggle}
                className="flex items-center justify-between w-full border-b border-gray-100 pb-1 hover:border-gray-300 transition-colors cursor-pointer group"
            >
                <div className="flex items-center gap-2">
                    <span className={`w-1 h-3 ${id === 'critical' ? 'bg-red-500' : id === 'high' ? 'bg-orange-500' : 'bg-amber-500'}`} />
                    <span className="text-[10px] font-mono font-black text-gray-900 tracking-tight">{title} ({items.length})</span>
                </div>
                <div className="text-gray-400 group-hover:text-black">
                    {isExpanded ? <ChevronDown size={12} className="rotate-180" /> : <ChevronDown size={12} />}
                </div>
            </button>
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-col gap-4 overflow-hidden"
                    >
                        {items.map((item, idx) => (
                            <motion.div
                                key={item.id}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                onClick={() => onSignalClick(item.id)}
                                className="group cursor-pointer flex flex-col gap-1.5 p-2.5 -mx-2.5 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <div className={`w-1.5 h-1.5 rounded-full ${id === 'critical' ? 'bg-red-500' : id === 'high' ? 'bg-orange-500' : 'bg-amber-500'}`} />
                                        <span className="text-[9px] font-mono font-bold uppercase tracking-tighter">{item.monitorType}</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-gray-400 font-bold uppercase">{formatTime(item.detectedAt)}</span>
                                </div>
                                <h4 className="text-[12px] font-serif font-black italic text-gray-900 line-clamp-2 leading-snug group-hover:text-violet-600 transition-colors duration-300">
                                    {item.title}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0 text-gray-500">
                                    <span className="text-[9px] font-mono font-black border border-gray-200 px-1 hover:bg-black hover:text-white hover:border-black transition-colors">INVESTIGATE</span>
                                    <ExternalLink size={8} />
                                </div>
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
};

export default SignalsWidget;
