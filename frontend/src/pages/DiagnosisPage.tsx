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
        currentQuery,
        rootCause,
        impactMetrics,
        actions,
        geographicData,
        reset
    } = useDiagnosisStore();

    useEffect(() => {
        if (id) {
            // if we haven't started or the ID changed, start it
            if (status === 'idle') {
                startDiagnosis(query);
            }
        }

        // Cleanup on unmount
        return () => {
            reset();
        };
    }, [id, query, status, startDiagnosis, reset]);

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

            {status === 'completed' && rootCause && impactMetrics && geographicData && (
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
                        <GeographicOpportunityCard data={geographicData} />
                    </div>

                    <ChatInterface diagnosisId={id || ''} />
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default DiagnosisPage;
