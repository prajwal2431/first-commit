import React, { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import ChatInput from './ChatInput';

interface ChatInterfaceProps {
    diagnosisId: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ diagnosisId }) => {
    const { messages, isTyping, sendMessage } = useChatStore();
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSendMessage = (text: string) => {
        sendMessage(diagnosisId, text);
    };

    return (
        <div className="mt-8 pt-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="space-y-6">
                    {messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}

                    {isTyping && <TypingIndicator />}

                    <div ref={chatEndRef} />
                </div>

                <ChatInput onSubmit={handleSendMessage} disabled={isTyping} />
            </div>
        </div>
    );
};

export default ChatInterface;
