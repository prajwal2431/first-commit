import { useEffect } from 'react';
import { sseClient } from '@/services/sse/sseClient';
import { useSSEStore } from '@/stores/sseStore';
import { useDiagnosisStore } from '@/stores/diagnosisStore';
import { useDashboardStore } from '@/stores/dashboardStore';

export function useSSE() {
    const { setStatus, setLastEvent, setError } = useSSEStore();
    const { updateProgress } = useDiagnosisStore();
    const { addAnomaly } = useDashboardStore();

    useEffect(() => {
        // Connect on mount
        sseClient.connect();

        // Connection status listener
        const handleStatusChange = (data: any) => {
            setStatus(data.status);
            if (data.error) setError(data.error);
            else setError(null);
        };

        // Diagnosis progress listener
        const handleDiagnosisProgress = (data: any) => {
            if (data.step !== undefined) {
                updateProgress(data.step);
            }
        };

        // Live anomaly listener
        const handleNewAnomaly = (data: any) => {
            if (data.anomaly) {
                addAnomaly(data.anomaly);
            }
        };

        sseClient.on('connection_change', handleStatusChange);
        sseClient.on('diagnosis_progress', handleDiagnosisProgress);
        sseClient.on('new_anomaly', handleNewAnomaly);
        sseClient.on('message', setLastEvent);

        return () => {
            // Disconnect or cleanup listeners?
            // For global event stream, we usually keep it alive in many apps,
            // but we should definitely remove our handlers.
            sseClient.off('connection_change', handleStatusChange);
            sseClient.off('diagnosis_progress', handleDiagnosisProgress);
            sseClient.off('new_anomaly', handleNewAnomaly);
            sseClient.off('message', setLastEvent);
        };
    }, [setStatus, setLastEvent, setError, updateProgress, addAnomaly]);
}
