import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSourcesStore } from '@/stores/sourcesStore';
import SourceCard from '@/components/sources/SourceCard';
import AddSourceCard from '@/components/sources/AddSourceCard';

const SourcesPage: React.FC = () => {
    const { sources, fetchSources, uploadSource, uploadError, clearUploadError, disconnectSource } = useSourcesStore();
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    const handleAddSource = () => {
        clearUploadError();
        setSelectedFile(null);
        setShowUpload(true);
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const name = file.name.toLowerCase();
            const allowed = name.endsWith('.xlsx') || name.endsWith('.csv');
            if (!allowed) {
                clearUploadError();
                setShowUpload(false);
                return;
            }
            setSelectedFile(file);
        }
        if (e.target) e.target.value = '';
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        setUploading(true);
        try {
            await uploadSource(selectedFile);
            setShowUpload(false);
            setSelectedFile(null);
        } catch {
            // Error already set in store
        } finally {
            setUploading(false);
        }
    };

    const handleCloseUpload = () => {
        setShowUpload(false);
        setSelectedFile(null);
        clearUploadError();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8 pb-24"
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleFileChange}
            />
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

            {showUpload && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white p-6 max-w-sm w-full border border-gray-200 shadow-xl relative">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-serif italic text-gray-900 border-b border-black inline-block">
                                Upload data
                            </h3>
                            <button
                                onClick={handleCloseUpload}
                                className="text-gray-400 hover:text-black hover:bg-gray-100 p-1 transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            Excel: orders/inventory. CSV: daily retail (date, sku, revenue, units, traffic, inventory, returns). Column names can vary (e.g. sales → revenue, qty → units).
                        </p>
                        <div className="mb-4">
                            <input
                                type="file"
                                accept=".xlsx,.csv"
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-gray-100 file:text-gray-700"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setSelectedFile(f ?? null);
                                }}
                            />
                            {selectedFile && (
                                <p className="mt-2 text-xs text-gray-500 truncate">{selectedFile.name}</p>
                            )}
                        </div>
                        {uploadError && (
                            <p className="text-sm text-red-600 mb-4">{uploadError}</p>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCloseUpload}
                                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || uploading}
                                className="px-4 py-2 bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer font-mono text-xs uppercase"
                            >
                                {uploading ? 'Uploading…' : 'Upload'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default SourcesPage;
