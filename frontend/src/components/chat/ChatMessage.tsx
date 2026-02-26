import React from 'react';
import { motion } from 'framer-motion';
import type { ChatMessage as IChatMessage } from '@/types';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
    message: IChatMessage;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-4", isUser ? 'justify-end' : 'justify-start')}
        >
            {!isUser && (
                <div className="w-8 h-8 bg-black flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                    <span className="font-serif italic text-xs">N</span>
                </div>
            )}
            <div className={cn(
                "p-4 max-w-lg shadow-sm",
                isUser ? 'bg-gray-100 text-gray-900' : 'bg-white border border-gray-100 text-gray-800'
            )}>
                <p className="text-sm leading-relaxed">{message.content}</p>
            </div>
        </motion.div>
    );
};

export default ChatMessage;
