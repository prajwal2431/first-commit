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
            <div className="w-9 h-9 bg-black flex items-center justify-center text-white flex-shrink-0 shadow-md">
                <span className="font-serif italic text-sm">N</span>
            </div>
            <div className="bg-white border border-gray-100 px-5 py-3.5 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
        </motion.div>
    );
};

export default TypingIndicator;
