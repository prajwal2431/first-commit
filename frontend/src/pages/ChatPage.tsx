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
            className="flex flex-col"
            style={{ height: 'calc(100vh - 64px)' }}
        >
            <ChatInterface sessionId={sessionId} />
        </motion.div>
    );
};

export default ChatPage;
