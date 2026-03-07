import React from 'react';
import { motion } from 'framer-motion';
import type { ChatMessage as IChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface ChatMessageProps {
    message: IChatMessage;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const isUser = message.role === 'user';
    const { user } = useAuthStore();

    const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    const userInitials = user?.tenant?.companyName
        ?.split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() ?? 'U';

    // Preprocess markdown to ensure bullet points are on new lines if the LLM doesn't include them
    const processedContent = message.content.replace(/([^\n])\s+[-*]\s+/g, '$1\n- ');

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn("flex gap-3", isUser ? 'justify-end' : 'justify-start')}
        >
            {/* Bot Avatar */}
            {!isUser && (
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1 ring-1 ring-black/5">
                    <span className="font-serif italic text-[11px] font-black">N</span>
                </div>
            )}

            {/* Message Bubble */}
            <div className={cn("max-w-[85%] sm:max-w-lg flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
                <div className={cn(
                    "px-4 py-3 shadow-sm overflow-x-auto",
                    isUser
                        ? 'bg-ink text-white rounded-[18px] rounded-tr-[6px]'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-[18px] rounded-tl-[6px]'
                )}>
                    <div className={cn(
                        "text-[13px] leading-relaxed",
                        isUser ? 'text-white/95' : 'text-gray-700'
                    )}>
                        <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-[14px] font-semibold mb-2">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-[13px] font-semibold mb-1.5">{children}</h3>,
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="pl-1">{children}</li>,
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-gray-300 pl-3 my-2 italic opacity-90">
                                        {children}
                                    </blockquote>
                                ),
                                hr: () => <hr className="my-2 border-gray-200" />,
                                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                                a: ({ href, children }) => (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            "underline underline-offset-2",
                                            isUser ? "text-white" : "text-black"
                                        )}
                                    >
                                        {children}
                                    </a>
                                ),
                                code: ({ children }) => <code className="bg-gray-100 px-1 rounded text-xs font-mono text-gray-800">{children}</code>,
                                pre: ({ children }) => (
                                    <pre className="bg-gray-100 text-gray-800 rounded-md p-2 overflow-x-auto my-2 text-xs font-mono">
                                        {children}
                                    </pre>
                                ),
                            }}
                        >
                            {processedContent}
                        </ReactMarkdown>
                    </div>
                </div>
                <span className={cn(
                    "text-[9px] font-mono tracking-wider text-gray-400 px-1",
                    isUser ? 'text-right' : 'text-left'
                )}>
                    {time}
                </span>
            </div>

            {/* User Avatar */}
            {isUser && (
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-sm mt-1 ring-1 ring-black/5">
                    <span className="font-serif italic text-[11px] font-black">{userInitials}</span>
                </div>
            )}
        </motion.div>
    );
};

export default ChatMessage;
