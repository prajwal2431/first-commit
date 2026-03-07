import React from 'react';
import { motion } from 'framer-motion';

const TypingIndicator: React.FC = () => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex gap-3 justify-start"
        >
            <div className="w-8 h-8 bg-black flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1 ring-1 ring-black/5">
                <span className="font-serif italic text-[11px] font-black">N</span>
            </div>
            <div className="bg-white border border-gray-100 px-4 py-3 flex items-center gap-1.5 shadow-sm rounded-2xl rounded-tl-none">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
        </motion.div>
    );
};

export default TypingIndicator;
