import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
    onSubmit: (text: string) => void;
    disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, disabled }) => {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 150) + 'px';
        }
    }, [text]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!text.trim() || disabled) return;
        onSubmit(text.trim());
        setText("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="relative group">
            {/* Glow effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-orange-300 opacity-0 group-focus-within:opacity-15 blur-lg transition-opacity duration-500" />

            <form
                onSubmit={handleSubmit}
                className="relative bg-white/90 backdrop-blur-xl border border-gray-200 shadow-xl flex items-end gap-2 p-3 transition-shadow duration-300 group-focus-within:shadow-2xl"
            >
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none text-base text-gray-800 placeholder-gray-400 px-3 py-2 resize-none font-sans disabled:opacity-50 leading-relaxed"
                    placeholder="Type your message..."
                    style={{ maxHeight: '150px' }}
                />
                <button
                    type="submit"
                    disabled={!text.trim() || disabled}
                    className="bg-black text-white p-3 hover:bg-gray-800 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 hover:scale-105 active:scale-95"
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
};

export default ChatInput;
