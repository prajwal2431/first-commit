import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Anchor, Plus, Network, ShoppingCart, Box, Instagram, Truck, Database } from 'lucide-react';
import { useSourcesStore } from '@/stores/sourcesStore';
import GridCard from '@/components/ui/GridCard';
import Tag from '@/components/ui/Tag';
import EcosystemAddSourceModal from '@/components/sources/EcosystemAddSourceModal';

const getDomainIcon = (label: string = '', domain: string = '') => {
    if (label.includes('Shopify') || label.includes('WooCommerce') || label.includes('Magento')) return <ShoppingCart size={20} className="text-black" />;
    if (label.includes('Unicommerce') || label.includes('SAP') || label.includes('Tally')) return <Box size={20} className="text-black" />;
    if (label.includes('Meta') || label.includes('Google') || label.includes('TikTok')) return <Instagram size={20} className="text-black" />;
    if (label.includes('Dart') || label.includes('rocket') || label.includes('Delhivery')) return <Truck size={20} className="text-black" />;

    switch (domain) {
        case 'Sales & Orders': return <ShoppingCart size={20} className="text-black" />;
        case 'Inventory & ERP': return <Box size={20} className="text-black" />;
        case 'Marketing & Traffic': return <Instagram size={20} className="text-black" />;
        case 'Fulfillment': return <Truck size={20} className="text-black" />;
        default: return <Database size={20} className="text-black" />;
    }
}

const SourcesPage: React.FC = () => {
    const { sources, fetchSources } = useSourcesStore();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 pb-24"
        >
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <div>
                    <h2 className="text-2xl font-serif italic text-gray-900">Connected Grounding Sources</h2>
                    <p className="text-sm text-gray-500 mt-1">Nexus continuously syncs these "Experts" to provide accurate Root Cause Analyses.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-black text-white px-4 py-2 font-mono text-xs tracking-widest hover:bg-gray-800 transition-colors flex items-center gap-2  cursor-pointer"
                >
                    <Anchor size={14} /> ADD SOURCE
                </button>
            </div>

            {/* Sources Grid/List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {sources.length === 0 && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 py-12 flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 bg-white/50 backdrop-blur-sm ">
                        <Network size={48} className="mb-4 opacity-50" />
                        <p className="font-mono text-xs tracking-widest uppercase">No sources connected</p>
                        <p className="text-sm mt-2 text-gray-500 max-w-md text-center">Connect your POS, WMS, or Marketing feeds to allow Nexus to perform cross-domain Root Cause Analysis.</p>
                    </div>
                )}

                {sources.map((src) => (
                    <GridCard key={src.id} colSpan="col-span-1" className="border border-gray-200 hover:border-black hover:bg-gray-50 transition-colors group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-white border border-gray-200 group-hover:border-black transition-colors flex items-center justify-center ">
                                {getDomainIcon(src.label || src.name, src.domain)}
                            </div>
                            <Tag type={src.status.includes('syncing') ? 'alert' : 'success'}>{src.status}</Tag>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 truncate" title={src.label || src.name}>{src.label || src.name}</h3>
                            <p className="text-[10px] font-mono text-gray-500 mt-1 uppercase tracking-widest">MAP: {src.domain || 'Data Ingestion'}</p>
                            <p className="text-[10px] font-mono text-gray-500 mt-1 uppercase tracking-widest border border-gray-200 inline-block px-1.5 py-0.5 bg-white ">VIA {src.mode || 'Upload'}</p>
                        </div>
                        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                            <span className="text-gray-400">LAST SYNC:</span>
                            <span className={src.status.includes('syncing') ? 'text-orange-600 animate-pulse' : 'text-emerald-600'}>
                                {src.lastSync}
                            </span>
                        </div>
                    </GridCard>
                ))}

                {/* Persistent Add Card */}
                <div
                    onClick={() => setIsAddModalOpen(true)}
                    className="col-span-1 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-gray-400 hover:text-black hover:border-black hover:bg-gray-50 transition-colors cursor-pointer bg-white/30 backdrop-blur-sm min-h-[220px] "
                >
                    <Plus size={32} />
                    <span className="mt-4 font-mono text-[10px] uppercase tracking-widest">Add Source</span>
                </div>
            </div>

            <EcosystemAddSourceModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />
        </motion.div>
    );
};

export default SourcesPage;
