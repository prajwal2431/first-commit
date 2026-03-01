import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Plus, Trash2, Save, Mail, Server, Check, AlertTriangle,
    SlidersHorizontal, TrendingDown, Package, Truck, BarChart3, RotateCcw, Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, DEFAULT_THRESHOLDS } from '@/stores/settingsStore';
import type { SignalThresholds } from '@/stores/settingsStore';

interface DepartmentEdit {
    id: string;
    name: string;
    email: string;
}

type SettingsTab = 'departments' | 'smtp' | 'thresholds';

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { departments, smtp, thresholds, isLoading, fetchSettings, updateDepartments, updateSmtp, updateThresholds } = useSettingsStore();

    const [activeTab, setActiveTab] = useState<SettingsTab>('departments');
    const [deptList, setDeptList] = useState<DepartmentEdit[]>([]);
    const [smtpForm, setSmtpForm] = useState({
        host: '',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        fromName: 'Nexus Intelligence',
        fromEmail: '',
    });
    const [thresholdForm, setThresholdForm] = useState<SignalThresholds>({ ...DEFAULT_THRESHOLDS });
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        setDeptList(departments.map(d => ({ ...d })));
    }, [departments]);

    useEffect(() => {
        if (smtp) {
            setSmtpForm({
                host: smtp.host || '',
                port: smtp.port || 587,
                secure: smtp.secure || false,
                user: smtp.user || '',
                pass: smtp.pass || '',
                fromName: smtp.fromName || 'Nexus Intelligence',
                fromEmail: smtp.fromEmail || '',
            });
        }
    }, [smtp]);

    useEffect(() => {
        if (thresholds) {
            setThresholdForm({ ...DEFAULT_THRESHOLDS, ...thresholds });
        }
    }, [thresholds]);

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 3000);
    };

    // Departments handlers
    const handleAddDepartment = () => {
        const id = `dept-${Date.now()}`;
        setDeptList([...deptList, { id, name: '', email: '' }]);
    };

    const handleRemoveDepartment = (id: string) => {
        setDeptList(deptList.filter(d => d.id !== id));
    };

    const handleDeptChange = (id: string, field: 'name' | 'email', value: string) => {
        setDeptList(deptList.map(d => d.id === id ? { ...d, [field]: value } : d));
    };

    const handleSaveDepartments = async () => {
        try {
            await updateDepartments(deptList.filter(d => d.name.trim()));
            showFeedback('success', 'Departments saved');
        } catch (err: any) {
            showFeedback('error', err?.data?.message || 'Failed to save');
        }
    };

    // SMTP handlers
    const handleSaveSmtp = async () => {
        try {
            await updateSmtp(smtpForm as any);
            showFeedback('success', 'SMTP configuration saved');
        } catch (err: any) {
            showFeedback('error', err?.data?.message || 'Failed to save SMTP settings');
        }
    };

    // Threshold handlers
    const handleThresholdChange = (key: string, value: number) => {
        setThresholdForm(prev => ({ ...prev, [key]: value }));
    };

    const handleNestedThresholdChange = (parentKey: string, childKey: string, value: number) => {
        setThresholdForm(prev => ({
            ...prev,
            [parentKey]: { ...(prev as any)[parentKey], [childKey]: value },
        }));
    };

    const handleResetThreshold = (key: string) => {
        const defaultVal = (DEFAULT_THRESHOLDS as any)[key];
        if (typeof defaultVal === 'object') {
            setThresholdForm(prev => ({ ...prev, [key]: { ...defaultVal } }));
        } else {
            setThresholdForm(prev => ({ ...prev, [key]: defaultVal }));
        }
    };

    const handleResetAllThresholds = () => {
        setThresholdForm({ ...DEFAULT_THRESHOLDS });
    };

    const handleSaveThresholds = async () => {
        try {
            await updateThresholds(thresholdForm);
            showFeedback('success', 'Thresholds saved — signals are being recomputed');
        } catch (err: any) {
            showFeedback('error', err?.data?.message || 'Failed to save thresholds');
        }
    };

    const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
        { id: 'departments', label: 'Departments', icon: <Mail size={16} /> },
        { id: 'smtp', label: 'SMTP', icon: <Server size={16} /> },
        { id: 'thresholds', label: 'Thresholds', icon: <SlidersHorizontal size={16} /> },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="h-full flex flex-col"
        >
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors font-mono group mb-4"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    BACK
                </button>
                <h1 className="text-3xl font-serif italic text-gray-900">Settings</h1>
                <p className="text-sm font-mono text-gray-400 mt-1 tracking-wide">ORGANIZATION CONFIGURATION</p>
            </div>

            {/* Global Feedback */}
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`mb-4 px-4 py-3 flex items-center gap-2 text-xs font-mono ${feedback.type === 'success'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                    >
                        {feedback.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {feedback.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Layout: Side nav + Content */}
            <div className="flex flex-1 gap-0 min-h-0">
                {/* Side Navigation */}
                <div className="w-48 shrink-0 border-r border-gray-100 pr-0">
                    <nav className="flex flex-col gap-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-4 py-3 text-left text-sm transition-all ${activeTab === tab.id
                                        ? 'bg-gray-100 text-black font-bold border-l-2 border-black'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 border-l-2 border-transparent'
                                    }`}
                            >
                                <span className={activeTab === tab.id ? 'text-black' : 'text-gray-400'}>
                                    {tab.icon}
                                </span>
                                <span className="font-mono text-xs tracking-wide uppercase">{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pl-8 pb-12">
                    <AnimatePresence mode="wait">
                        {activeTab === 'departments' && (
                            <motion.div
                                key="departments"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="max-w-2xl"
                            >
                                <DepartmentsPanel
                                    deptList={deptList}
                                    isLoading={isLoading}
                                    onAdd={handleAddDepartment}
                                    onRemove={handleRemoveDepartment}
                                    onChange={handleDeptChange}
                                    onSave={handleSaveDepartments}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'smtp' && (
                            <motion.div
                                key="smtp"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="max-w-2xl"
                            >
                                <SmtpPanel
                                    form={smtpForm}
                                    isLoading={isLoading}
                                    onChange={setSmtpForm}
                                    onSave={handleSaveSmtp}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'thresholds' && (
                            <motion.div
                                key="thresholds"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="max-w-2xl"
                            >
                                <ThresholdsPanel
                                    form={thresholdForm}
                                    isLoading={isLoading}
                                    onChange={handleThresholdChange}
                                    onNestedChange={handleNestedThresholdChange}
                                    onResetOne={handleResetThreshold}
                                    onResetAll={handleResetAllThresholds}
                                    onSave={handleSaveThresholds}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Departments Panel ────────────────────────────────────────────────────────

const DepartmentsPanel: React.FC<{
    deptList: DepartmentEdit[];
    isLoading: boolean;
    onAdd: () => void;
    onRemove: (id: string) => void;
    onChange: (id: string, field: 'name' | 'email', value: string) => void;
    onSave: () => void;
}> = ({ deptList, isLoading, onAdd, onRemove, onChange, onSave }) => (
    <div className="space-y-6">
        <div>
            <h3 className="text-lg font-serif italic text-gray-900 flex items-center gap-2">
                <Mail size={18} />
                Departments
            </h3>
            <p className="text-xs font-mono text-gray-400 mt-1">Configure departments and their email addresses for signal notifications</p>
        </div>

        <div className="space-y-3">
            {deptList.map((dept, i) => (
                <motion.div
                    key={dept.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3"
                >
                    <input
                        type="text"
                        value={dept.name}
                        onChange={(e) => onChange(dept.id, 'name', e.target.value)}
                        placeholder="Department name"
                        className="flex-1 border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors"
                    />
                    <input
                        type="email"
                        value={dept.email}
                        onChange={(e) => onChange(dept.id, 'email', e.target.value)}
                        placeholder="email@company.com"
                        className="flex-1 border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                    />
                    <button
                        onClick={() => onRemove(dept.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                        <Trash2 size={14} />
                    </button>
                </motion.div>
            ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
                onClick={onAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-gray-100 hover:bg-gray-200 transition-colors"
            >
                <Plus size={14} />
                ADD DEPARTMENT
            </button>
            <button
                onClick={onSave}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 active:scale-95"
            >
                <Save size={12} />
                SAVE DEPARTMENTS
            </button>
        </div>
    </div>
);

// ─── SMTP Panel ───────────────────────────────────────────────────────────────

const SmtpPanel: React.FC<{
    form: any;
    isLoading: boolean;
    onChange: (form: any) => void;
    onSave: () => void;
}> = ({ form, isLoading, onChange, onSave }) => (
    <div className="space-y-6">
        <div>
            <h3 className="text-lg font-serif italic text-gray-900 flex items-center gap-2">
                <Server size={18} />
                SMTP Configuration
            </h3>
            <p className="text-xs font-mono text-gray-400 mt-1">Configure email delivery for sending signal insights to departments</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">HOST</label>
                <input
                    type="text"
                    value={form.host}
                    onChange={(e) => onChange({ ...form, host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                />
            </div>
            <div className="col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">PORT</label>
                <input
                    type="number"
                    value={form.port}
                    onChange={(e) => onChange({ ...form, port: parseInt(e.target.value) || 587 })}
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                />
            </div>
            <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">USERNAME / EMAIL</label>
                <input
                    type="text"
                    value={form.user}
                    onChange={(e) => onChange({ ...form, user: e.target.value })}
                    placeholder="your-email@gmail.com"
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                />
            </div>
            <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">PASSWORD / APP PASSWORD</label>
                <input
                    type="password"
                    value={form.pass}
                    onChange={(e) => onChange({ ...form, pass: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                />
            </div>
            <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">FROM NAME</label>
                <input
                    type="text"
                    value={form.fromName}
                    onChange={(e) => onChange({ ...form, fromName: e.target.value })}
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors"
                />
            </div>
            <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-mono text-gray-500 mb-1 block">FROM EMAIL</label>
                <input
                    type="email"
                    value={form.fromEmail}
                    onChange={(e) => onChange({ ...form, fromEmail: e.target.value })}
                    placeholder="notifications@company.com"
                    className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                />
            </div>
            <div className="col-span-2 flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => onChange({ ...form, secure: e.target.checked })}
                    id="smtp-secure"
                    className="accent-black"
                />
                <label htmlFor="smtp-secure" className="text-xs font-mono text-gray-600">Use TLS/SSL (port 465)</label>
            </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
                onClick={onSave}
                disabled={isLoading || !form.host || !form.user || !form.pass}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 active:scale-95"
            >
                <Save size={12} />
                SAVE SMTP
            </button>
        </div>
    </div>
);

// ─── Thresholds Panel ─────────────────────────────────────────────────────────

interface ThresholdRowProps {
    label: string;
    description: string;
    value: number;
    defaultValue: number;
    unit: string;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    onReset: () => void;
}

const ThresholdRow: React.FC<ThresholdRowProps> = ({
    label, description, value, defaultValue, unit, min, max, step = 1, onChange, onReset,
}) => {
    const isModified = value !== defaultValue;

    return (
        <div className="flex items-center gap-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50/50 -mx-2 px-2 transition-colors">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-800 font-bold uppercase tracking-tight">{label}</span>
                    {isModified && (
                        <span className="text-[8px] font-mono text-violet-600 bg-violet-50 px-1 py-0.5">MODIFIED</span>
                    )}
                </div>
                <p className="text-[10px] font-mono text-gray-400 mt-0.5 leading-snug">{description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v >= min && v <= max) onChange(v);
                    }}
                    min={min}
                    max={max}
                    step={step}
                    className="w-20 border border-gray-200 px-2 py-1.5 text-sm text-right font-mono bg-white outline-none focus:border-black transition-colors"
                />
                <span className="text-[10px] font-mono text-gray-400 w-6">{unit}</span>
                <button
                    onClick={onReset}
                    className={`p-1 transition-all ${isModified ? 'text-gray-400 hover:text-black' : 'text-gray-200 cursor-default'}`}
                    title={`Reset to default (${defaultValue})`}
                    disabled={!isModified}
                >
                    <RotateCcw size={12} />
                </button>
            </div>
        </div>
    );
};

const ThresholdsPanel: React.FC<{
    form: SignalThresholds;
    isLoading: boolean;
    onChange: (key: string, value: number) => void;
    onNestedChange: (parentKey: string, childKey: string, value: number) => void;
    onResetOne: (key: string) => void;
    onResetAll: () => void;
    onSave: () => void;
}> = ({ form, isLoading, onChange, onNestedChange, onResetOne, onResetAll, onSave }) => {

    const sections: Array<{
        title: string;
        icon: React.ReactNode;
        description: string;
        rows: ThresholdRowProps[];
    }> = [
            {
                title: 'Revenue',
                icon: <TrendingDown size={16} />,
                description: 'Control when revenue-related signals fire. Lower values = more sensitive, higher = less noise.',
                rows: [
                    {
                        label: 'Revenue Drop (WoW)',
                        description: 'Weekly revenue decline % that triggers a signal',
                        value: form.revenueDropWoW,
                        defaultValue: DEFAULT_THRESHOLDS.revenueDropWoW,
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onChange('revenueDropWoW', v),
                        onReset: () => onResetOne('revenueDropWoW'),
                    },
                    {
                        label: 'Revenue Drop (DoD)',
                        description: 'Daily revenue decline % that triggers a signal',
                        value: form.revenueDropDoD,
                        defaultValue: DEFAULT_THRESHOLDS.revenueDropDoD,
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onChange('revenueDropDoD', v),
                        onReset: () => onResetOne('revenueDropDoD'),
                    },
                    {
                        label: 'Traffic↑ CVR↓ — Traffic Delta',
                        description: 'Traffic increase % for conversion mismatch detection',
                        value: form.trafficUpCvrDown.trafficDelta,
                        defaultValue: DEFAULT_THRESHOLDS.trafficUpCvrDown.trafficDelta,
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onNestedChange('trafficUpCvrDown', 'trafficDelta', v),
                        onReset: () => onResetOne('trafficUpCvrDown'),
                    },
                    {
                        label: 'Traffic↑ CVR↓ — Revenue Delta',
                        description: 'Revenue decline % threshold when traffic is rising',
                        value: Math.abs(form.trafficUpCvrDown.revenueDelta),
                        defaultValue: Math.abs(DEFAULT_THRESHOLDS.trafficUpCvrDown.revenueDelta),
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onNestedChange('trafficUpCvrDown', 'revenueDelta', -Math.abs(v)),
                        onReset: () => onResetOne('trafficUpCvrDown'),
                    },
                    {
                        label: 'AOV Collapse',
                        description: 'Average order value decline % to trigger signal',
                        value: form.aovCollapse,
                        defaultValue: DEFAULT_THRESHOLDS.aovCollapse,
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onChange('aovCollapse', v),
                        onReset: () => onResetOne('aovCollapse'),
                    },
                    {
                        label: 'Top SKU Revenue Drop',
                        description: 'Individual SKU revenue decline % to trigger signal',
                        value: form.topSkuRevenueDrop,
                        defaultValue: DEFAULT_THRESHOLDS.topSkuRevenueDrop,
                        unit: '%', min: 1, max: 80,
                        onChange: (v) => onChange('topSkuRevenueDrop', v),
                        onReset: () => onResetOne('topSkuRevenueDrop'),
                    },
                ],
            },
            {
                title: 'Inventory',
                icon: <Package size={16} />,
                description: 'OOS rate thresholds — determines when stockout signals escalate from warning to critical.',
                rows: [
                    {
                        label: 'OOS Rate (Warning)',
                        description: 'OOS rate % above which a warning signal is fired',
                        value: form.oosRateWarning,
                        defaultValue: DEFAULT_THRESHOLDS.oosRateWarning,
                        unit: '%', min: 0.5, max: 100, step: 0.5,
                        onChange: (v) => onChange('oosRateWarning', v),
                        onReset: () => onResetOne('oosRateWarning'),
                    },
                    {
                        label: 'OOS Rate (Critical)',
                        description: 'OOS rate % above which a critical signal is fired',
                        value: form.oosRateCritical,
                        defaultValue: DEFAULT_THRESHOLDS.oosRateCritical,
                        unit: '%', min: 1, max: 100, step: 0.5,
                        onChange: (v) => onChange('oosRateCritical', v),
                        onReset: () => onResetOne('oosRateCritical'),
                    },
                ],
            },
            {
                title: 'Operations',
                icon: <Truck size={16} />,
                description: 'Return rate, SLA adherence, cancellations, and RTO (Return to Origin) thresholds.',
                rows: [
                    {
                        label: 'Return Rate (Warning)',
                        description: 'Return rate % that triggers a warning',
                        value: form.returnRateWarning,
                        defaultValue: DEFAULT_THRESHOLDS.returnRateWarning,
                        unit: '%', min: 0.5, max: 50, step: 0.5,
                        onChange: (v) => onChange('returnRateWarning', v),
                        onReset: () => onResetOne('returnRateWarning'),
                    },
                    {
                        label: 'Return Rate (Critical)',
                        description: 'Return rate % that triggers a critical signal',
                        value: form.returnRateCritical,
                        defaultValue: DEFAULT_THRESHOLDS.returnRateCritical,
                        unit: '%', min: 1, max: 50,
                        onChange: (v) => onChange('returnRateCritical', v),
                        onReset: () => onResetOne('returnRateCritical'),
                    },
                    {
                        label: 'SLA Adherence (Warning)',
                        description: 'SLA % below which a warning fires — e.g. 90 means warn if adherence < 90%',
                        value: form.slaAdherenceWarning,
                        defaultValue: DEFAULT_THRESHOLDS.slaAdherenceWarning,
                        unit: '%', min: 50, max: 100,
                        onChange: (v) => onChange('slaAdherenceWarning', v),
                        onReset: () => onResetOne('slaAdherenceWarning'),
                    },
                    {
                        label: 'SLA Adherence (Critical)',
                        description: 'SLA % below which a critical signal fires',
                        value: form.slaAdherenceCritical,
                        defaultValue: DEFAULT_THRESHOLDS.slaAdherenceCritical,
                        unit: '%', min: 30, max: 100,
                        onChange: (v) => onChange('slaAdherenceCritical', v),
                        onReset: () => onResetOne('slaAdherenceCritical'),
                    },
                    {
                        label: 'Cancel Rate (Warning)',
                        description: 'Cancellation rate % for warning',
                        value: form.cancelRateWarning,
                        defaultValue: DEFAULT_THRESHOLDS.cancelRateWarning,
                        unit: '%', min: 0.5, max: 30, step: 0.5,
                        onChange: (v) => onChange('cancelRateWarning', v),
                        onReset: () => onResetOne('cancelRateWarning'),
                    },
                    {
                        label: 'Cancel Rate (Critical)',
                        description: 'Cancellation rate % for critical',
                        value: form.cancelRateCritical,
                        defaultValue: DEFAULT_THRESHOLDS.cancelRateCritical,
                        unit: '%', min: 1, max: 50,
                        onChange: (v) => onChange('cancelRateCritical', v),
                        onReset: () => onResetOne('cancelRateCritical'),
                    },
                    {
                        label: 'RTO Rate (Warning)',
                        description: 'Return-to-Origin rate % for warning (India-specific)',
                        value: form.rtoRateWarning,
                        defaultValue: DEFAULT_THRESHOLDS.rtoRateWarning,
                        unit: '%', min: 1, max: 40,
                        onChange: (v) => onChange('rtoRateWarning', v),
                        onReset: () => onResetOne('rtoRateWarning'),
                    },
                    {
                        label: 'RTO Rate (Critical)',
                        description: 'Return-to-Origin rate % for critical',
                        value: form.rtoRateCritical,
                        defaultValue: DEFAULT_THRESHOLDS.rtoRateCritical,
                        unit: '%', min: 2, max: 50,
                        onChange: (v) => onChange('rtoRateCritical', v),
                        onReset: () => onResetOne('rtoRateCritical'),
                    },
                ],
            },
            {
                title: 'Demand',
                icon: <BarChart3 size={16} />,
                description: 'Statistical sensitivity for demand spike detection. Lower σ multiplier = more signals, higher = fewer false positives.',
                rows: [
                    {
                        label: 'Demand Spike (σ multiplier)',
                        description: 'Standard deviation multiplier for aggregate unit spikes',
                        value: form.demandSpikeStdDevMultiplier,
                        defaultValue: DEFAULT_THRESHOLDS.demandSpikeStdDevMultiplier,
                        unit: 'σ', min: 0.5, max: 5, step: 0.1,
                        onChange: (v) => onChange('demandSpikeStdDevMultiplier', v),
                        onReset: () => onResetOne('demandSpikeStdDevMultiplier'),
                    },
                    {
                        label: 'SKU Spike (σ multiplier)',
                        description: 'Standard deviation multiplier for individual SKU spikes',
                        value: form.skuSpikeStdDevMultiplier,
                        defaultValue: DEFAULT_THRESHOLDS.skuSpikeStdDevMultiplier,
                        unit: 'σ', min: 0.5, max: 5, step: 0.1,
                        onChange: (v) => onChange('skuSpikeStdDevMultiplier', v),
                        onReset: () => onResetOne('skuSpikeStdDevMultiplier'),
                    },
                    {
                        label: 'SKU Spike (min average multiplier)',
                        description: 'Minimum times-average units required to confirm a spike',
                        value: form.skuSpikeMinMultiplier,
                        defaultValue: DEFAULT_THRESHOLDS.skuSpikeMinMultiplier,
                        unit: 'x', min: 1, max: 10, step: 0.1,
                        onChange: (v) => onChange('skuSpikeMinMultiplier', v),
                        onReset: () => onResetOne('skuSpikeMinMultiplier'),
                    },
                ],
            },
        ];

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-serif italic text-gray-900 flex items-center gap-2">
                    <SlidersHorizontal size={18} />
                    Signal Detection Thresholds
                </h3>
                <p className="text-xs font-mono text-gray-400 mt-1">
                    Customize when signals are triggered based on your business context. Lower values increase sensitivity (more signals), higher values reduce noise.
                </p>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 bg-violet-50/50 border border-violet-100 p-3">
                <Info size={14} className="text-violet-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-violet-700 leading-snug">
                    Changes trigger an immediate recomputation of all signals. Your Intelligence Hub sidebar will update automatically.
                </p>
            </div>

            {sections.map((section) => (
                <div key={section.title} className="border border-gray-100 bg-white/80">
                    {/* Section Header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <span className="text-gray-600">{section.icon}</span>
                        <div>
                            <h4 className="text-sm font-mono font-bold text-gray-900 uppercase tracking-tight">{section.title}</h4>
                            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{section.description}</p>
                        </div>
                    </div>
                    {/* Rows */}
                    <div className="px-5 py-2">
                        {section.rows.map((row) => (
                            <ThresholdRow key={row.label} {...row} />
                        ))}
                    </div>
                </div>
            ))}

            {/* Action bar */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                    onClick={onResetAll}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-gray-500 hover:text-black hover:bg-gray-100 transition-colors"
                >
                    <RotateCcw size={12} />
                    RESET ALL TO DEFAULTS
                </button>
                <button
                    onClick={onSave}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 active:scale-95"
                >
                    <Save size={12} />
                    SAVE THRESHOLDS
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;
