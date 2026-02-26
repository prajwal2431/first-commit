import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
    onSubmit: (text: string) => void;
    disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, disabled }) => {
    const [text, setText] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim() || disabled) return;
        onSubmit(text);
        setText("");
    };

    return (
        <div className="relative group mt-8 sticky bottom-4">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-orange-300 opacity-10 blur-md transition duration-500 group-hover:opacity-30"></div>
            <form onSubmit={handleSubmit} className="relative bg-white border border-gray-200 shadow-lg p-2 flex items-center">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={disabled}
                    className="w-full bg-transparent border-none outline-none text-base md:text-lg font-serif italic text-gray-800 placeholder-gray-400 px-6 disabled:opacity-50"
                    placeholder="Ask a follow-up (e.g., 'What is the cost of transfer?')"
                />
                <button
                    type="submit"
                    disabled={!text.trim() || disabled}
                    className="bg-black text-white p-3 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
};

export default ChatInput;
