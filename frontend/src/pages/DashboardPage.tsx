import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import RevenueAtRiskChart from '@/components/dashboard/RevenueAtRiskChart';
import LiveSignalsFeed from '@/components/dashboard/LiveSignalsFeed';
import DiagnosisSearchBar from '@/components/dashboard/DiagnosisSearchBar';
import { useDashboardStore } from '@/stores/dashboardStore';

const DashboardPage: React.FC = () => {
    const { fetchDashboard } = useDashboardStore();

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
        >
            <div className="grid grid-cols-12 gap-6">
                <RevenueAtRiskChart />
                <LiveSignalsFeed />
            </div>

            <DiagnosisSearchBar />
        </motion.div>
    );
};

export default DashboardPage;
