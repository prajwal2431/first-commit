import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisStepProps {
    step: string;
    label: string;
    status: 'waiting' | 'processing' | 'done';
}

const AnalysisStep: React.FC<AnalysisStepProps> = ({ step, status, label }) => {
    const isProcessing = status === 'processing';
    const isDone = status === 'done';

    return (
        <div className="flex items-center space-x-4 py-3 border-b border-gray-100 last:border-0">
            <div className={cn(
                "w-6 h-6 flex items-center justify-center border transition-colors duration-300",
                isDone ? 'bg-black border-black text-white' :
                    isProcessing ? 'border-orange-400 text-orange-500 animate-pulse' :
                        'border-gray-300 text-gray-300'
            )}>
                {isDone ? <ArrowRight size={12} /> : <span className="text-[10px] font-mono">{step}</span>}
            </div>
            <div className="flex-1">
                <p className={cn(
                    "text-sm font-medium transition-colors duration-300",
                    isProcessing ? 'text-orange-600' : isDone ? 'text-black' : 'text-gray-400'
                )}>
                    {label}
                </p>
                {isProcessing && (
                    <div className="w-full bg-gray-100 h-0.5 mt-2 overflow-hidden">
                        <motion.div
                            className="h-full bg-orange-400"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                    </div>
                )}
            </div>
            <span className="font-mono text-[10px] text-gray-400 uppercase">
                {status === 'waiting' ? 'QUEUED' : status}
            </span>
        </div>
    );
};

export default AnalysisStep;
