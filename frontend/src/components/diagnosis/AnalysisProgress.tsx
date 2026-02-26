import React from 'react';
import { Cpu } from 'lucide-react';
import GridCard from '@/components/ui/GridCard';
import AnalysisStep from './AnalysisStep';

interface AnalysisProgressProps {
    progress: number; // 0-4
}

const AnalysisProgress: React.FC<AnalysisProgressProps> = ({ progress }) => {
    const steps = [
        { label: "Querying Shopify & Unicommerce (WMS)" },
        { label: "Analyzing Meta Ads & Instagram Signals" },
        { label: "Correlating Regional Demand vs Inventory" },
        { label: "Generating Action Plan for Supply Chain" }
    ];

    return (
        <div className="max-w-3xl mx-auto py-12">
            <GridCard colSpan="col-span-12" className="min-h-[500px] flex flex-col items-center justify-center border-0 shadow-2xl">
                <div className="w-full max-w-lg space-y-8">
                    <div className="text-center space-y-2">
                        <div className="inline-block p-4 border border-gray-100 bg-white shadow-sm mb-4">
                            <Cpu className="w-8 h-8 text-black animate-spin-slow" />
                        </div>
                        <h2 className="text-3xl font-serif italic">Synthesizing Intelligence</h2>
                        <p className="font-mono text-xs text-gray-500 tracking-wider">
                            CROSS-REFERENCING {Math.min(progress + 1, 4)}/4 DATASETS
                        </p>
                    </div>

                    <div className="space-y-0 border-t border-gray-100 bg-gray-50/50 p-6">
                        {steps.map((step, i) => {
                            let status: 'waiting' | 'processing' | 'done' = 'waiting';
                            if (progress > i) status = 'done';
                            else if (progress === i) status = 'processing';

                            return (
                                <AnalysisStep
                                    key={i}
                                    step={`0${i + 1}`}
                                    label={step.label}
                                    status={status}
                                />
                            );
                        })}
                    </div>
                </div>
            </GridCard>
        </div>
    );
};

export default AnalysisProgress;
