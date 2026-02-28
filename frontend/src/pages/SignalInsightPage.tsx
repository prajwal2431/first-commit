import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, AlertTriangle, Zap, Clock, Send, ChevronRight,
    TrendingDown, Package, Truck, BarChart3, Check, ExternalLink, X
} from 'lucide-react';
import {
    AreaChart, Area, BarChart as ReBarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { request } from '@/services/api/client';
import { useSettingsStore } from '@/stores/settingsStore';

interface DataPoint {
    label: string;
    value: string | number;
    delta?: number;
}

interface AffectedItem {
    name: string;
    impact: string;
    detail: string;
}

interface RecommendedAction {
    action: string;
    priority: 'high' | 'medium' | 'low';
    department: string;
}

interface EnrichedEvidence {
    dataPoints: DataPoint[];
    chartData: Array<Record<string, any>>;
    chartType: 'area' | 'bar' | 'line';
    chartKeys: { x: string; y: string[]; colors: string[] };
    affectedItems: AffectedItem[];
    rootCauseSummary: string;
}

interface SignalInsight {
    signal: {
        id: string;
        severity: string;
        monitorType: string;
        title: string;
        description: string;
        suggestedQuery: string;
        evidenceSnippet: string;
        detectedAt: string;
    };
    evidence: EnrichedEvidence;
    aiSummary: string;
    recommendedActions: RecommendedAction[];
    relatedSignals: Array<{
        id: string;
        title: string;
        severity: string;
        monitorType: string;
    }>;
}

const SignalInsightPage: React.FC = () => {
    const { signalId } = useParams<{ signalId: string }>();
    const navigate = useNavigate();
    const { departments, fetchSettings } = useSettingsStore();
    const [insight, setInsight] = useState<SignalInsight | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Send to department modal state
    const [showSendModal, setShowSendModal] = useState(false);
    const [selectedDeptId, setSelectedDeptId] = useState<string>('');
    const [sendNote, setSendNote] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (!signalId) return;

        setIsLoading(true);
        setError(null);

        request<SignalInsight>(`/signals/${signalId}`)
            .then((data) => {
                setInsight(data);
                setIsLoading(false);
            })
            .catch((err) => {
                console.error('Failed to load signal insight:', err);
                setError('Failed to load signal insight');
                setIsLoading(false);
            });
    }, [signalId]);

    const handleSendToDepartment = async () => {
        if (!selectedDeptId || !signalId) return;
        setIsSending(true);
        setSendResult(null);

        try {
            const result = await request<{ success: boolean; message: string; previewUrl?: string }>(
                '/notifications/send-signal',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        signalId,
                        departmentId: selectedDeptId,
                        note: sendNote || undefined,
                    }),
                }
            );
            setSendResult({ success: true, message: result.message });
            if (result.previewUrl) {
                console.log('Email preview (Ethereal):', result.previewUrl);
            }
        } catch (err: any) {
            setSendResult({ success: false, message: err?.data?.message || 'Failed to send' });
        } finally {
            setIsSending(false);
        }
    };

    const handleAskAbout = () => {
        if (!insight) return;
        navigate(`/dashboard/intelligence?q=${encodeURIComponent(insight.signal.suggestedQuery)}`);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-8 h-8 border-2 border-gray-200 border-t-black"
                />
            </div>
        );
    }

    if (error || !insight) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <p className="text-xl font-serif italic text-gray-600 mb-2">Signal not found</p>
                <p className="text-sm font-mono text-gray-400 mb-6">This signal may have expired or been resolved</p>
                <button
                    onClick={() => navigate('/dashboard/intelligence')}
                    className="text-sm font-mono px-4 py-2 bg-black text-white hover:bg-gray-800 transition-colors"
                >
                    Return to Intelligence
                </button>
            </div>
        );
    }

    const { signal, evidence, aiSummary, recommendedActions, relatedSignals } = insight;

    const severityConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
        critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'CRITICAL' },
        high: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', label: 'HIGH' },
        medium: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'MEDIUM' },
        low: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', label: 'LOW' },
    };

    const monitorIcons: Record<string, React.ReactNode> = {
        revenue: <TrendingDown size={18} />,
        inventory: <Package size={18} />,
        operations: <Truck size={18} />,
        demand: <BarChart3 size={18} />,
    };

    const sev = severityConfig[signal.severity] || severityConfig.medium;
    const detectedTime = new Date(signal.detectedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    const priorityBadge = (p: string) => {
        const cls = p === 'high'
            ? 'bg-red-100 text-red-700'
            : p === 'medium'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700';
        return <span className={`text-[10px] font-mono px-1.5 py-0.5 ${cls} uppercase`}>{p}</span>;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6 pb-12"
        >
            {/* Back Button */}
            <button
                onClick={() => navigate('/dashboard/intelligence')}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors font-mono group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                BACK TO INTELLIGENCE
            </button>

            {/* Signal Header */}
            <div className={`${sev.bg} border ${sev.border} p-6`}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 ${sev.bg} ${sev.color} border ${sev.border}`}>
                            {monitorIcons[signal.monitorType] || <Zap size={18} />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-mono px-2 py-0.5 ${sev.color} ${sev.bg} border ${sev.border} uppercase tracking-wider`}>
                                    {sev.label}
                                </span>
                                <span className="text-[10px] font-mono text-gray-400 uppercase">{signal.monitorType}</span>
                            </div>
                            <h1 className="text-2xl font-serif italic text-gray-900 mb-2">{signal.title}</h1>
                            <p className="text-sm text-gray-600">{signal.description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400 shrink-0">
                        <Clock size={12} />
                        {detectedTime}
                    </div>
                </div>
            </div>

            {/* AI Summary */}
            <div className="bg-white/80 backdrop-blur border border-gray-200/80 p-6">
                <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-3">[ AI SUMMARY ]</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{aiSummary}</p>
                <button
                    onClick={handleAskAbout}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-mono text-gray-500 hover:text-black transition-colors group"
                >
                    <span>ASK NEXUS ABOUT THIS</span>
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            {/* Evidence Grid */}
            <div className="grid grid-cols-12 gap-6">
                {/* KPI Cards */}
                <div className="col-span-12 lg:col-span-4 space-y-3">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase">[ KEY METRICS ]</h3>
                    {evidence.dataPoints.map((dp, i) => (
                        <motion.div
                            key={dp.label}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-white/80 border border-gray-200/60 p-4 flex items-center justify-between"
                        >
                            <span className="text-xs font-mono text-gray-500 uppercase">{dp.label}</span>
                            <div className="text-right">
                                <span className="text-lg font-serif text-gray-900">{dp.value}</span>
                                {dp.delta !== undefined && (
                                    <span className={`ml-2 text-xs font-mono ${dp.delta < 0 ? 'text-red-500' : dp.delta > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                        {dp.delta > 0 ? '+' : ''}{dp.delta}%
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Chart */}
                <div className="col-span-12 lg:col-span-8 bg-white/80 border border-gray-200/60 p-6">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-4">[ DATA VISUALIZATION ]</h3>
                    {evidence.chartData.length > 0 ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                {evidence.chartType === 'area' ? (
                                    <AreaChart data={evidence.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis dataKey={evidence.chartKeys.x} axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #eee', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                                        {evidence.chartKeys.y.map((key, idx) => (
                                            <Area
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={evidence.chartKeys.colors[idx] || '#7C3AED'}
                                                fill={idx === 0 ? 'transparent' : `${evidence.chartKeys.colors[idx]}15`}
                                                strokeWidth={2}
                                                strokeDasharray={idx === 0 ? '5 5' : undefined}
                                            />
                                        ))}
                                    </AreaChart>
                                ) : evidence.chartType === 'bar' ? (
                                    <ReBarChart data={evidence.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis dataKey={evidence.chartKeys.x} axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #eee', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                                        {evidence.chartKeys.y.map((key, idx) => (
                                            <Bar
                                                key={key}
                                                dataKey={key}
                                                fill={evidence.chartKeys.colors[idx] || '#7C3AED'}
                                                radius={[2, 2, 0, 0]}
                                            />
                                        ))}
                                    </ReBarChart>
                                ) : (
                                    <LineChart data={evidence.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                                        <XAxis dataKey={evidence.chartKeys.x} axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10 }} />
                                        <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #eee', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                                        <Legend />
                                        {evidence.chartKeys.y.map((key, idx) => (
                                            <Line
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={evidence.chartKeys.colors[idx] || '#7C3AED'}
                                                strokeWidth={2}
                                                dot={false}
                                                strokeDasharray={idx === 1 ? '5 5' : undefined}
                                            />
                                        ))}
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm font-mono">
                            No chart data available for this signal
                        </div>
                    )}
                </div>
            </div>

            {/* Root Cause */}
            {evidence.rootCauseSummary && (
                <div className="bg-white/80 border border-gray-200/60 p-6">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-3">[ ROOT CAUSE ]</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">{evidence.rootCauseSummary}</p>
                </div>
            )}

            {/* Affected Items */}
            {evidence.affectedItems.length > 0 && (
                <div className="bg-white/80 border border-gray-200/60 p-6">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-4">[ AFFECTED ITEMS ]</h3>
                    <div className="space-y-2">
                        {evidence.affectedItems.map((item, i) => (
                            <motion.div
                                key={item.name}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center justify-between p-3 border border-gray-100 hover:border-gray-200 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-900">{item.name}</span>
                                    <span className="text-xs font-mono text-gray-400">{item.detail}</span>
                                </div>
                                <span className={`text-sm font-mono font-semibold ${item.impact.includes('-') || item.impact.includes('return') ? 'text-red-600' : 'text-gray-700'}`}>
                                    {item.impact}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommended Actions */}
            <div className="bg-white/80 border border-gray-200/60 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase">[ RECOMMENDED ACTIONS ]</h3>
                    <button
                        onClick={() => setShowSendModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors active:scale-95"
                    >
                        <Send size={12} />
                        SEND TO DEPARTMENT
                    </button>
                </div>
                <div className="space-y-3">
                    {recommendedActions.map((action, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-start gap-3 p-4 border border-gray-100 hover:border-gray-200 transition-colors"
                        >
                            <div className="w-6 h-6 bg-gray-100 flex items-center justify-center text-xs font-mono text-gray-500 shrink-0 mt-0.5">
                                {i + 1}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-gray-800">{action.action}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    {priorityBadge(action.priority)}
                                    <span className="text-[10px] font-mono text-gray-400">{action.department}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Related Signals */}
            {relatedSignals.length > 0 && (
                <div className="bg-white/80 border border-gray-200/60 p-6">
                    <h3 className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-4">[ RELATED SIGNALS ]</h3>
                    <div className="space-y-2">
                        {relatedSignals.slice(0, 4).map((rs) => (
                            <button
                                key={rs.id}
                                onClick={() => navigate(`/dashboard/signals/${rs.id}`)}
                                className="w-full flex items-center justify-between p-3 border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all group text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${rs.severity === 'critical' ? 'bg-red-500' : rs.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500'}`} />
                                    <span className="text-sm text-gray-700 group-hover:text-black">{rs.title}</span>
                                </div>
                                <ExternalLink size={12} className="text-gray-300 group-hover:text-gray-600 transition-colors" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Send to Department Modal */}
            <AnimatePresence>
                {showSendModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => { setShowSendModal(false); setSendResult(null); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white w-full max-w-md p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-serif italic text-gray-900">Send Insight</h3>
                                <button
                                    onClick={() => { setShowSendModal(false); setSendResult(null); }}
                                    className="p-1 text-gray-400 hover:text-black transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {sendResult ? (
                                <div className={`p-4 ${sendResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border mb-4`}>
                                    <div className="flex items-center gap-2">
                                        {sendResult.success ? <Check size={16} className="text-green-600" /> : <AlertTriangle size={16} className="text-red-600" />}
                                        <p className={`text-sm ${sendResult.success ? 'text-green-700' : 'text-red-700'}`}>{sendResult.message}</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2 block">Department</label>
                                            <select
                                                value={selectedDeptId}
                                                onChange={(e) => setSelectedDeptId(e.target.value)}
                                                className="w-full border border-gray-200 p-2.5 text-sm bg-white focus:border-black focus:ring-0 outline-none transition-colors"
                                            >
                                                <option value="">Select department...</option>
                                                {departments.filter(d => d.email).map((dept) => (
                                                    <option key={dept.id} value={dept.id}>
                                                        {dept.name} ({dept.email})
                                                    </option>
                                                ))}
                                            </select>
                                            {departments.filter(d => d.email).length === 0 && (
                                                <p className="text-xs text-amber-600 mt-1 font-mono">
                                                    No departments with emails configured. Update in Settings.
                                                </p>
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2 block">Note (optional)</label>
                                            <textarea
                                                value={sendNote}
                                                onChange={(e) => setSendNote(e.target.value)}
                                                rows={3}
                                                className="w-full border border-gray-200 p-2.5 text-sm bg-white focus:border-black focus:ring-0 outline-none transition-colors resize-none"
                                                placeholder="Add a note for context..."
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            onClick={() => setShowSendModal(false)}
                                            className="px-4 py-2 text-sm text-gray-600 hover:text-black transition-colors font-mono"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSendToDepartment}
                                            disabled={!selectedDeptId || isSending}
                                            className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                        >
                                            {isSending ? (
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ repeat: Infinity, duration: 1 }}
                                                    className="w-4 h-4 border border-white/30 border-t-white"
                                                />
                                            ) : (
                                                <Send size={14} />
                                            )}
                                            {isSending ? 'Sending...' : 'Send'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default SignalInsightPage;
