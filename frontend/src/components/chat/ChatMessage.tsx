import React from 'react';
import { motion } from 'framer-motion';
import type { ChatMessage as IChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

interface ChatMessageProps {
    message: IChatMessage;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';

    const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn("flex gap-3", isUser ? 'justify-end' : 'justify-start')}
        >
            {/* Bot Avatar */}
            {!isUser && (
                <div className="w-9 h-9 bg-black flex items-center justify-center text-white flex-shrink-0 shadow-md mt-1">
                    <span className="font-serif italic text-sm">N</span>
                </div>
            )}

            {/* Message Bubble */}
            <div className="max-w-lg flex flex-col gap-1">
                <div className={cn(
                    "px-5 py-3.5 shadow-sm",
                    isUser
                        ? 'bg-black text-white'
                        : 'bg-white border border-gray-100 text-gray-800'
                )}>
                    <p className={cn(
                        "text-sm leading-relaxed",
                        isUser ? 'text-white/95' : 'text-gray-700'
                    )}>
                        {message.content}
                    </p>
                </div>
                <span className={cn(
                    "text-[10px] font-mono tracking-wider text-gray-300 px-1",
                    isUser ? 'text-right' : 'text-left'
                )}>
                    {time}
                </span>
            </div>

            {/* User Avatar */}
            {isUser && (
                <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-orange-400 flex items-center justify-center text-white flex-shrink-0 shadow-md mt-1">
                    <User size={16} />
                </div>
            )}
        </motion.div>
    );
};

export default ChatMessage;
