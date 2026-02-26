import React from 'react';
import GridCard from '@/components/ui/GridCard';
import AlertItem from './AlertItem';
import { useNavigate } from 'react-router-dom';

const LiveSignalsFeed: React.FC = () => {
    const navigate = useNavigate();

    const handleAlertClick = (alertMsg: string) => {
        // In a real app, this would create a session/diagnosis first
        const mockId = Date.now().toString();
        console.log(`Diagnosing: ${alertMsg}`);
        navigate(`/diagnosis/${mockId}`);
    };

    return (
        <GridCard colSpan="col-span-12 lg:col-span-4" title="Live Signals" meta="BHARAT_FEED" className="border border-gray-200/60">
            <div className="space-y-4 mt-2">
                <AlertItem
                    level="critical"
                    msg="Stockout: Disney Stitch Oversized Tee (Delhi)"
                    time="12m ago"
                    onClick={() => handleAlertClick("Stockout spike for Disney Stitch Tee in Delhi")}
                />
                <AlertItem
                    level="warning"
                    msg="Traffic Spike: Instagram Reel @RiyaJain"
                    time="1h ago"
                    onClick={() => handleAlertClick("Instagram traffic correlation with SKU-DISNEY-01")}
                />
                <AlertItem
                    level="info"
                    msg="Marketplace: Myntra Sync Latency High"
                    time="3h ago"
                    onClick={() => handleAlertClick("Myntra marketplace sync latency")}
                />
            </div>
        </GridCard>
    );
};

export default LiveSignalsFeed;
