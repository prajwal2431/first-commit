import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSourcesStore } from '@/stores/sourcesStore';
import SourceCard from '@/components/sources/SourceCard';
import AddSourceCard from '@/components/sources/AddSourceCard';

const SourcesPage: React.FC = () => {
    const { sources, fetchSources, connectSource, disconnectSource } = useSourcesStore();
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    const handleAddSource = () => {
        setIsConnecting(true);
        // Mock new source selection
        const name = `New Source ${sources.length + 1}`;
        const type = 'custom';
        connectSource(type, name);
        setTimeout(() => setIsConnecting(false), 2000); // Simulate connection modal close
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 pb-24" // Extra padding for the bottom
        >
            <div className="grid grid-cols-12 gap-6">
                {sources.map(source => (
                    <SourceCard
                        key={source.id}
                        source={source}
                        onDisconnect={disconnectSource}
                    />
                ))}
                <AddSourceCard onAdd={handleAddSource} />
            </div>

            {isConnecting && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 max-w-sm w-full border border-gray-200 shadow-xl relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-serif italic text-gray-900 border-b border-black inline-block">Connecting Source</h3>
                            <button onClick={() => setIsConnecting(false)} className="text-gray-400 hover:text-black hover:bg-gray-100 p-1 transition-colors">✕</button>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            Simulating the connection of a new data source via OAuth. In a real application, you would see a provider selection screen here.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setIsConnecting(false)}
                                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => setIsConnecting(false)}
                                className="px-4 py-2 bg-black text-white hover:bg-gray-800 transition-colors cursor-pointer font-mono text-xs uppercase"
                            >
                                Connect Let's Go
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default SourcesPage;
