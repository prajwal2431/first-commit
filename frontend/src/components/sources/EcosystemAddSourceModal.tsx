import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Check, Search, ChevronDown,
    ShoppingCart, Box, Instagram, Truck, Database,
    Key, Link as LinkIcon, UploadCloud, FileSpreadsheet, ArrowRight,
    AlertCircle
} from 'lucide-react';
import { useSourcesStore } from '@/stores/sourcesStore';

// --- ECOSYSTEM PLATFORMS ---
const PLATFORM_ECOSYSTEM: Record<string, string[]> = {
    'Sales & Orders': [
        'Shopify', 'WooCommerce', 'Magento', 'BigCommerce', 'Salesforce Commerce Cloud',
        'Amazon Seller Central', 'Flipkart', 'Myntra', 'Nykaa', 'Meesho', 'Ajio',
        'Blinkit', 'Zepto', 'Square POS', 'Custom Source'
    ],
    'Inventory & ERP': [
        'Unicommerce', 'EasyEcom', 'Vinculum', 'Increff', 'ShipHero', 'Cin7',
        'SAP S/4HANA', 'Oracle NetSuite', 'Microsoft Dynamics 365', 'Odoo',
        'Zoho Inventory', 'TallyPrime', 'ERPNext', 'Custom Source'
    ],
    'Marketing & Traffic': [
        'Meta Ads', 'Google Ads', 'Amazon Advertising', 'TikTok Ads', 'Pinterest Ads',
        'Google Analytics (GA4)', 'Mixpanel', 'Amplitude', 'Klaviyo', 'MoEngage',
        'WebEngage', 'HubSpot', 'Custom Source'
    ],
    'Fulfillment': [
        'BlueDart', 'Shiprocket', 'Pickrr', 'ClickPost', 'Delhivery', 'Xpressbees',
        'Ecom Express', 'Shadowfax', 'WareIQ', 'Custom Source'
    ]
};

const getCanonicalFields = (domain: string) => {
    switch (domain) {
        case 'Sales & Orders': return ['order_id', 'timestamp', 'sku', 'qty_sold', 'gross_revenue', 'status'];
        case 'Inventory & ERP': return ['sku', 'location_id', 'stock_on_hand', 'reserved_qty', 'restock_date'];
        case 'Marketing & Traffic': return ['campaign_id', 'ad_id', 'spend', 'impressions', 'clicks', 'conversions'];
        case 'Fulfillment': return ['shipment_id', 'order_id', 'carrier', 'tracking_status', 'eta'];
        default: return [];
    }
};

interface EcosystemAddSourceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const EcosystemAddSourceModal: React.FC<EcosystemAddSourceModalProps> = ({ isOpen, onClose }) => {
    const { connectSource, uploadSource, uploadError, clearUploadError } = useSourcesStore();

    const [ingestionMode, setIngestionMode] = useState<'api' | 'sheets' | 'upload'>('api');
    const [canonicalDomain, setCanonicalDomain] = useState<string>('Sales & Orders');
    const [connectorLabel, setConnectorLabel] = useState<string>('Shopify');

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [platformSearch, setPlatformSearch] = useState("");

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Reset selected platform when domain changes to avoid mismatches
    useEffect(() => {
        setConnectorLabel(PLATFORM_ECOSYSTEM[canonicalDomain][0]);
        setPlatformSearch("");
        setIsDropdownOpen(false);
    }, [canonicalDomain]);

    useEffect(() => {
        if (isOpen) {
            clearUploadError();
        } else {
            setIsDropdownOpen(false); // Make sure dropdown closes on modal close
        }
    }, [isOpen, clearUploadError]);

    const filteredPlatforms = PLATFORM_ECOSYSTEM[canonicalDomain].filter(p =>
        p.toLowerCase().includes(platformSearch.toLowerCase())
    );

    const handleConnect = async () => {
        setIsProcessing(true);
        try {
            if (ingestionMode === 'upload' && selectedFile) {
                await uploadSource(selectedFile, connectorLabel.toLowerCase());
            } else {
                connectSource({
                    name: connectorLabel,
                    label: connectorLabel,
                    domain: canonicalDomain,
                    mode: ingestionMode === 'api' ? 'API' : ingestionMode === 'sheets' ? 'Sheets' : 'Upload',
                    type: 'integration',
                    icon: 'database'
                });
            }
            onClose();
        } catch (err) {
            // Error is set in store if upload fails
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-xl flex items-center justify-center p-4 md:p-8">
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                transition={{ duration: 0.3 }}
                className="glass-panel border-r border-b border-l border-t border-gray-200 w-full max-w-2xl flex flex-col shadow-2xl relative overflow-hidden bg-white/95 rounded-none"
            >
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-black opacity-20" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-black opacity-20" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-black opacity-20" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-black opacity-20" />

                <div className="px-8 py-6 border-b border-gray-200 flex justify-between items-center bg-white">
                    <div>
                        <h2 className="text-3xl font-serif italic text-black">Connect Source</h2>
                        <p className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mt-1">Map source data intelligently</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black transition-colors rounded-none outline-none border border-transparent hover:border-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 h-[65vh] min-h-[400px] overflow-y-auto custom-scrollbar bg-gray-50/50 space-y-8">

                    {/* STEP 1 & 2 HORIZONTAL LAYOUT */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* Step 1: Select Canonical Domain */}
                        <div>
                            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-900 border-b border-black pb-2 mb-4">1. Select Domain</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.keys(PLATFORM_ECOSYSTEM).map(domain => {
                                    const isActive = canonicalDomain === domain;
                                    return (
                                        <button
                                            key={domain}
                                            onClick={() => setCanonicalDomain(domain)}
                                            className={`flex flex-col items-center justify-center p-4 border transition-all text-center gap-3 rounded-none outline-none ${isActive ? 'border-black bg-black text-white shadow-lg' : 'border-gray-200 hover:border-gray-400 bg-white text-gray-600 hover:text-black hover:shadow-md'}`}
                                        >
                                            {domain === 'Sales & Orders' && <ShoppingCart size={20} />}
                                            {domain === 'Inventory & ERP' && <Box size={20} />}
                                            {domain === 'Marketing & Traffic' && <Instagram size={20} />}
                                            {domain === 'Fulfillment' && <Truck size={20} />}
                                            <span className="font-sans text-[10px] font-medium leading-tight">{domain}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Step 2: Select Exact Connector/Platform */}
                        <div>
                            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-900 border-b border-black pb-2 mb-4">2. Select Platform</h3>

                            {/* Modern Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="w-full bg-white border border-gray-200 p-4 flex justify-between items-center outline-none hover:border-black transition-colors group rounded-none shadow-sm"
                                >
                                    <span className="text-sm font-medium text-gray-900">{connectorLabel}</span>
                                    <ChevronDown size={16} className={`text-gray-400 group-hover:text-black transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {isDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 w-full mt-2 bg-white border border-gray-200 shadow-xl z-50 rounded-none overflow-hidden"
                                        >
                                            <div className="p-3 border-b border-gray-100 bg-gray-50">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search platforms..."
                                                        value={platformSearch}
                                                        onChange={(e) => setPlatformSearch(e.target.value)}
                                                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 text-sm outline-none focus:border-black transition-colors rounded-none"
                                                    />
                                                </div>
                                            </div>
                                            <ul className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                                                {filteredPlatforms.length > 0 ? (
                                                    filteredPlatforms.map(platform => {
                                                        const isSelected = connectorLabel === platform;
                                                        return (
                                                            <li key={platform}>
                                                                <button
                                                                    onClick={() => {
                                                                        setConnectorLabel(platform);
                                                                        setIsDropdownOpen(false);
                                                                        setPlatformSearch("");
                                                                    }}
                                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex justify-between items-center rounded-none ${isSelected ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`}
                                                                >
                                                                    <span>{platform}</span>
                                                                    {isSelected && <Check size={14} className="shrink-0" />}
                                                                </button>
                                                            </li>
                                                        )
                                                    })
                                                ) : (
                                                    <li className="p-4 text-center text-xs text-gray-400">No platforms found.</li>
                                                )}
                                            </ul>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Connection Configuration */}
                    <div>
                        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-900 border-b border-black pb-2 mb-4">
                            3. Configure Implementation: <span className="text-emerald-600">{connectorLabel}</span>
                        </h3>

                        {/* Mode Tabs */}
                        <div className="flex border border-gray-200 p-1 bg-white rounded-none shadow-sm mb-6 inline-flex w-full md:w-auto overflow-x-auto custom-scrollbar">
                            <button
                                onClick={() => setIngestionMode('api')}
                                className={`flex-1 md:flex-none px-6 py-2.5 flex items-center justify-center gap-2 text-xs font-mono transition-colors rounded-none ${ingestionMode === 'api' ? 'bg-black text-white shadow-md' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                <Key size={14} /> API
                            </button>
                            <button
                                onClick={() => setIngestionMode('sheets')}
                                className={`flex-1 md:flex-none px-6 py-2.5 flex items-center justify-center gap-2 text-xs font-mono transition-colors rounded-none ${ingestionMode === 'sheets' ? 'bg-black text-white shadow-md' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                <LinkIcon size={14} /> SHEETS
                            </button>
                            <button
                                onClick={() => setIngestionMode('upload')}
                                className={`flex-1 md:flex-none px-6 py-2.5 flex items-center justify-center gap-2 text-xs font-mono transition-colors rounded-none ${ingestionMode === 'upload' ? 'bg-black text-white shadow-md' : 'hover:bg-gray-100 text-gray-600'}`}
                            >
                                <UploadCloud size={14} /> FILE
                            </button>
                        </div>

                        {/* Dynamic Form Area */}
                        <div className="bg-white border border-gray-200 p-6 md:p-8 rounded-none shadow-sm relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-200 via-gray-400 to-gray-200 opacity-20" />

                            {/* API Configuration */}
                            {ingestionMode === 'api' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

                                    <div className="p-4 bg-blue-50/50 border border-blue-100 text-blue-900 text-xs flex items-start gap-4 rounded-none">
                                        <div className="p-1.5 bg-blue-100 shrink-0 rounded-none"><Database size={14} className="text-blue-600" /></div>
                                        <p className="leading-relaxed mt-0.5">Nexus operates on a canonical data model. Authenticated data pulled from <strong>{connectorLabel}</strong> maps to <strong>{canonicalDomain}</strong> standard schemas.</p>
                                    </div>

                                    {connectorLabel === 'Shopify' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="md:col-span-2">
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Store Domain</label>
                                                <input type="text" placeholder="your-store.myshopify.com" className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors rounded-none shadow-sm" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Admin API Access Token</label>
                                                <input type="password" placeholder="shpat_..." className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-mono text-xs transition-colors rounded-none shadow-sm" />
                                            </div>
                                        </div>
                                    ) : connectorLabel === 'Unicommerce' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="md:col-span-2">
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Tenant URL</label>
                                                <input type="text" placeholder="https://{tenant}.unicommerce.com" className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors rounded-none shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Facility Code</label>
                                                <input type="text" placeholder="e.g. WH-BOM-01" className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors rounded-none shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">OAuth Token</label>
                                                <input type="password" placeholder="••••••••••••••••" className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-mono text-xs transition-colors rounded-none shadow-sm" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="md:col-span-2">
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Base API Endpoint</label>
                                                <input type="text" placeholder={`https://api.${connectorLabel.toLowerCase().replace(/\s+/g, '')}.com/v1/`} className="w-full bg-gray-50 border border-gray-200 p-3 outline-none hover:border-black focus:border-black focus:bg-white font-mono text-xs transition-colors rounded-none shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Auth Method</label>
                                                <div className="relative">
                                                    <select className="w-full bg-gray-50 border border-gray-200 p-3 outline-none hover:border-black focus:border-black focus:bg-white font-sans text-sm transition-colors appearance-none pr-8 rounded-none shadow-sm">
                                                        <option>Bearer Token</option>
                                                        <option>API Key (Header)</option>
                                                        <option>Basic Auth</option>
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Secret Token</label>
                                                <input type="password" placeholder="••••••••••••••••" className="w-full bg-gray-50 border border-gray-200 p-3 outline-none hover:border-black focus:border-black focus:bg-white font-mono text-xs transition-colors rounded-none shadow-sm" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-6 mt-6 border-t border-gray-100">
                                        <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Polling Schedule</label>
                                        <div className="relative inline-block w-full md:w-1/2">
                                            <select className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors appearance-none pr-8 rounded-none shadow-sm">
                                                <option>Real-time (Webhooks)</option>
                                                <option>Every 15 Minutes</option>
                                                <option>Hourly</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none" />
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Google Sheets Configuration */}
                            {ingestionMode === 'sheets' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 text-emerald-900 text-xs flex items-start gap-4 rounded-none">
                                        <div className="p-1.5 bg-emerald-100 shrink-0 rounded-none"><FileSpreadsheet size={14} className="text-emerald-600" /></div>
                                        <p className="leading-relaxed mt-0.5">Provide a read-only Google Sheets link. Ensure the first row contains canonical headers.</p>
                                    </div>
                                    <div>
                                        <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Read-Only URL</label>
                                        <input type="text" placeholder="https://docs.google.com/spreadsheets/d/..." className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-mono text-xs transition-colors rounded-none shadow-sm" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Worksheet Tab</label>
                                            <input type="text" placeholder={`e.g., ${connectorLabel.replace(/\s+/g, '_')}_Exports`} className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors rounded-none shadow-sm" />
                                        </div>
                                        <div>
                                            <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Frequency</label>
                                            <div className="relative">
                                                <select className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm transition-colors appearance-none pr-8 rounded-none shadow-sm">
                                                    <option>Every 15 Minutes</option>
                                                    <option>Hourly</option>
                                                    <option>Daily</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Canonical Mapping Preview */}
                                    <div className="pt-6 mt-6 border-t border-gray-100">
                                        <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                                            Canonical Output Schema
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {getCanonicalFields(canonicalDomain).map(field => (
                                                <span key={field} className="bg-gray-50 border border-gray-200 px-3 py-1.5 text-[10px] font-mono text-gray-800 rounded-none">{field}</span>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Upload Configuration */}
                            {ingestionMode === 'upload' && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                    <div
                                        onClick={() => document.getElementById('file-upload')?.click()}
                                        className="border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-black transition-colors cursor-pointer p-8 flex flex-col items-center justify-center text-center min-h-[160px] rounded-none group"
                                    >
                                        <input
                                            id="file-upload"
                                            type="file"
                                            accept=".xlsx,.csv"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) setSelectedFile(file);
                                            }}
                                        />
                                        <UploadCloud size={32} className="text-gray-400 mb-4 group-hover:text-black transition-colors" />
                                        <p className="font-sans font-medium text-sm text-gray-900 group-hover:text-black transition-colors">
                                            {selectedFile ? selectedFile.name : `Drop ${connectorLabel} export here or click to browse`}
                                        </p>
                                        {!selectedFile && <p className="font-mono text-[10px] text-gray-500 mt-2 uppercase tracking-widest">CSV, XLS up to 50MB</p>}
                                    </div>

                                    {uploadError && (
                                        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 p-3 rounded-none">
                                            <AlertCircle size={14} />
                                            <span className="text-xs font-mono">{uploadError}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-6 mt-6 border-t border-gray-100">
                                        <div>
                                            <label className="block font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">Update Strategy</label>
                                            <div className="relative">
                                                <select className="w-full bg-white border border-gray-200 p-3 outline-none focus:border-black font-sans text-sm text-gray-900 transition-colors appearance-none pr-8 rounded-none shadow-sm">
                                                    <option>Append to Existing</option>
                                                    <option>Overwrite Historical</option>
                                                    <option>Merge on Keys</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-3 text-gray-400 w-4 h-4 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                        </div>
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-gray-200 bg-white flex justify-between items-center shrink-0">
                    <p className="text-[10px] font-mono text-gray-400 hidden sm:block">Nexus canonical mapping active.</p>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={onClose} className="flex-1 sm:flex-none px-6 py-2.5 outline-none font-mono text-xs tracking-widest text-gray-500 hover:text-black transition-colors bg-transparent rounded-none">
                            CANCEL
                        </button>
                        <button
                            onClick={handleConnect}
                            disabled={isProcessing || (ingestionMode === 'upload' && !selectedFile)}
                            className="flex-1 sm:flex-none px-6 py-2.5 outline-none border border-black bg-black text-white font-mono text-xs tracking-widest hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:border-gray-400 flex items-center justify-center gap-2 shadow-lg rounded-none"
                        >
                            {isProcessing ? 'CONNECTING...' : <>CONNECT <ArrowRight size={14} /></>}
                        </button>
                    </div>
                </div>

            </motion.div>
        </div>
    );

    const portalRoot = document.getElementById('right-pane');
    if (portalRoot) {
        return createPortal(modalContent, portalRoot);
    }

    // Fallback if right-pane id doesn't exist yet
    return modalContent;
};

export default EcosystemAddSourceModal;
