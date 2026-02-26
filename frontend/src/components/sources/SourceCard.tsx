import React from 'react';
import { RefreshCw, XCircle, CheckCircle, Database } from 'lucide-react';
import type { DataSource } from '@/types';
import GridCard from '@/components/ui/GridCard';

interface SourceCardProps {
    source: DataSource;
    onDisconnect: (id: string) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, onDisconnect }) => {
    const isConnected = source.status === 'connected';
    const isSyncing = source.status === 'syncing';
    const isDisconnected = source.status === 'disconnected';

    return (
        <GridCard className="col-span-12 md:col-span-6 lg:col-span-4 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 flex justify-center items-center">
                        <Database size={20} className="text-gray-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900">{source.name}</h3>
                        <p className="text-xs font-mono text-gray-400 uppercase">{source.type}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isSyncing && <RefreshCw size={14} className="animate-spin text-orange-500" />}
                    {isConnected && <CheckCircle size={14} className="text-emerald-500" />}
                    {isDisconnected && <XCircle size={14} className="text-red-500" />}
                </div>
            </div>

            <div className="border border-gray-100 p-3 bg-white mt-auto">
                <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{isDisconnected ? 'Disconnected' : `Last sync: ${source.lastSync}`}</span>
                    {!isDisconnected && (
                        <button
                            onClick={() => onDisconnect(source.id)}
                            className="hover:text-red-500 transition-colors flex items-center gap-1"
                        >
                            <XCircle size={12} /> Disconnect
                        </button>
                    )}
                </div>
            </div>
        </GridCard>
    );
};

export default SourceCard;
