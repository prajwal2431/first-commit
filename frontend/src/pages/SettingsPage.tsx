import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save, Mail, Server, Check, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settingsStore';

interface DepartmentEdit {
    id: string;
    name: string;
    email: string;
}

const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { departments, smtp, isLoading, fetchSettings, updateDepartments, updateSmtp } = useSettingsStore();

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
    const [deptSaved, setDeptSaved] = useState(false);
    const [smtpSaved, setSmtpSaved] = useState(false);
    const [deptError, setDeptError] = useState<string | null>(null);
    const [smtpError, setSmtpError] = useState<string | null>(null);

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
        setDeptSaved(false);
        setDeptError(null);
        try {
            await updateDepartments(deptList.filter(d => d.name.trim()));
            setDeptSaved(true);
            setTimeout(() => setDeptSaved(false), 3000);
        } catch (err: any) {
            setDeptError(err?.data?.message || 'Failed to save');
        }
    };

    const handleSaveSmtp = async () => {
        setSmtpSaved(false);
        setSmtpError(null);
        try {
            await updateSmtp(smtpForm as any);
            setSmtpSaved(true);
            setTimeout(() => setSmtpSaved(false), 3000);
        } catch (err: any) {
            setSmtpError(err?.data?.message || 'Failed to save SMTP settings');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8 pb-12 max-w-3xl"
        >
            {/* Back */}
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors font-mono group"
            >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                BACK
            </button>

            <div>
                <h1 className="text-3xl font-serif italic text-gray-900">Settings</h1>
                <p className="text-sm font-mono text-gray-400 mt-1 tracking-wide">ORGANIZATION CONFIGURATION</p>
            </div>

            {/* Departments Section */}
            <div className="bg-white/80 border border-gray-200/60 p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-serif italic text-gray-900 flex items-center gap-2">
                            <Mail size={18} />
                            Departments
                        </h3>
                        <p className="text-xs font-mono text-gray-400 mt-1">Configure departments and their email addresses for signal notifications</p>
                    </div>
                    <button
                        onClick={handleAddDepartment}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        <Plus size={14} />
                        ADD
                    </button>
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
                                onChange={(e) => handleDeptChange(dept.id, 'name', e.target.value)}
                                placeholder="Department name"
                                className="flex-1 border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors"
                            />
                            <input
                                type="email"
                                value={dept.email}
                                onChange={(e) => handleDeptChange(dept.id, 'email', e.target.value)}
                                placeholder="email@company.com"
                                className="flex-1 border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                            />
                            <button
                                onClick={() => handleRemoveDepartment(dept.id)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </motion.div>
                    ))}
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                    {deptSaved && (
                        <span className="text-xs font-mono text-green-600 flex items-center gap-1">
                            <Check size={12} /> Saved
                        </span>
                    )}
                    {deptError && (
                        <span className="text-xs font-mono text-red-600 flex items-center gap-1">
                            <AlertTriangle size={12} /> {deptError}
                        </span>
                    )}
                    {!deptSaved && !deptError && <span />}
                    <button
                        onClick={handleSaveDepartments}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 active:scale-95"
                    >
                        <Save size={12} />
                        SAVE DEPARTMENTS
                    </button>
                </div>
            </div>

            {/* SMTP Section */}
            <div className="bg-white/80 border border-gray-200/60 p-6">
                <div className="mb-6">
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
                            value={smtpForm.host}
                            onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                            placeholder="smtp.gmail.com"
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                        />
                    </div>
                    <div className="col-span-1">
                        <label className="text-xs font-mono text-gray-500 mb-1 block">PORT</label>
                        <input
                            type="number"
                            value={smtpForm.port}
                            onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 587 })}
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-mono text-gray-500 mb-1 block">USERNAME / EMAIL</label>
                        <input
                            type="text"
                            value={smtpForm.user}
                            onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                            placeholder="your-email@gmail.com"
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-mono text-gray-500 mb-1 block">PASSWORD / APP PASSWORD</label>
                        <input
                            type="password"
                            value={smtpForm.pass}
                            onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })}
                            placeholder="••••••••••••"
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-mono text-gray-500 mb-1 block">FROM NAME</label>
                        <input
                            type="text"
                            value={smtpForm.fromName}
                            onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors"
                        />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-xs font-mono text-gray-500 mb-1 block">FROM EMAIL</label>
                        <input
                            type="email"
                            value={smtpForm.fromEmail}
                            onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                            placeholder="notifications@company.com"
                            className="w-full border border-gray-200 px-3 py-2 text-sm bg-white outline-none focus:border-black transition-colors font-mono"
                        />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={smtpForm.secure}
                            onChange={(e) => setSmtpForm({ ...smtpForm, secure: e.target.checked })}
                            id="smtp-secure"
                            className="accent-black"
                        />
                        <label htmlFor="smtp-secure" className="text-xs font-mono text-gray-600">Use TLS/SSL (port 465)</label>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                    {smtpSaved && (
                        <span className="text-xs font-mono text-green-600 flex items-center gap-1">
                            <Check size={12} /> SMTP saved
                        </span>
                    )}
                    {smtpError && (
                        <span className="text-xs font-mono text-red-600 flex items-center gap-1">
                            <AlertTriangle size={12} /> {smtpError}
                        </span>
                    )}
                    {!smtpSaved && !smtpError && <span />}
                    <button
                        onClick={handleSaveSmtp}
                        disabled={isLoading || !smtpForm.host || !smtpForm.user || !smtpForm.pass}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-mono hover:bg-gray-800 transition-colors disabled:opacity-40 active:scale-95"
                    >
                        <Save size={12} />
                        SAVE SMTP
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default SettingsPage;
