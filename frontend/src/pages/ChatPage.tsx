import React from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ChatInterface from '@/components/chat/ChatInterface';

const ChatPage: React.FC = () => {
    const { sessionId } = useParams<{ sessionId?: string }>();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col min-h-full flex-1"
        >
            <ChatInterface sessionId={sessionId} />
        </motion.div>
    );
};

export default ChatPage;
