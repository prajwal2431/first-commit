import React from 'react';
import { motion } from 'framer-motion';

const TypingIndicator: React.FC = () => {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 justify-start">
            <div className="w-8 h-8 bg-black flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                <span className="font-serif italic text-xs">N</span>
            </div>
            <div className="bg-white border border-gray-100 px-4 py-3 flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
        </motion.div>
    );
};

export default TypingIndicator;
