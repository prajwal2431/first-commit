import React from 'react';

interface QueryHeaderProps {
    query: string;
}

const QueryHeader: React.FC<QueryHeaderProps> = ({ query }) => {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-black text-white p-6 shadow-xl gap-4">
            <div>
                <div className="font-mono text-xs text-gray-400 mb-1">QUERY ANALYSIS</div>
                <h2 className="font-serif italic text-2xl">"{query}"</h2>
            </div>
        </div>
    );
};

export default QueryHeader;
