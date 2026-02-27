import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiagnosisStore } from '@/stores/diagnosisStore';

import AnalysisProgress from '@/components/diagnosis/AnalysisProgress';
import QueryHeader from '@/components/diagnosis/QueryHeader';
import RootCauseCard from '@/components/diagnosis/RootCauseCard';
import BusinessImpactCard from '@/components/diagnosis/BusinessImpactCard';
import RecommendedActionsCard from '@/components/diagnosis/RecommendedActionsCard';
import GeographicOpportunityCard from '@/components/diagnosis/GeographicOpportunityCard';
import ChatInterface from '@/components/chat/ChatInterface';

const DiagnosisPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || 'System Diagnosis';

    const {
        status,
        analysisProgress,
        startDiagnosis,
        fetchResult,
        currentQuery,
        rootCause,
        impactMetrics,
        actions,
        geographicData,
        reset,
        diagnosisId,
    } = useDiagnosisStore();

    useEffect(() => {
        if (id) {
            if (status === 'idle') {
                if (diagnosisId === id) {
                    fetchResult(id);
                } else {
                    startDiagnosis(query);
                }
            }
        }

        return () => {
            reset();
        };
    }, [id, query, status, startDiagnosis, fetchResult, reset, diagnosisId]);

    return (
        <AnimatePresence mode="wait">
            {status === 'analyzing' && (
                <motion.div
                    key="analyzing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <AnalysisProgress progress={analysisProgress} />
                </motion.div>
            )}

            {status === 'completed' && rootCause && impactMetrics && (
                <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="space-y-6 pb-24"
                >
                    <QueryHeader query={currentQuery} />

                    <div className="grid grid-cols-12 gap-6">
                        <RootCauseCard rootCause={rootCause} />
                        <BusinessImpactCard metrics={impactMetrics} />
                        <RecommendedActionsCard actions={actions} />
                        {geographicData && (
                            <GeographicOpportunityCard data={geographicData} />
                        )}
                    </div>

                    <ChatInterface diagnosisId={id || ''} />
                </motion.div>
            )}

            {status === 'error' && (
                <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center min-h-[400px]"
                >
                    <div className="text-center space-y-4">
                        <p className="text-xl font-serif italic text-gray-600">Analysis could not be completed</p>
                        <p className="text-sm font-mono text-gray-400">Please ensure data has been uploaded and try again</p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DiagnosisPage;
