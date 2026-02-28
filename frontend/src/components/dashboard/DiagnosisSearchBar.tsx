import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DiagnosisSearchBar: React.FC = () => {
    const [query, setQuery] = useState("");
    const navigate = useNavigate();

    const handleDiagnose = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!query.trim()) return;
        navigate(`/dashboard/chat?q=${encodeURIComponent(query.trim())}`);
    };

    const suggestions = [
        "Why is revenue dropping for Disney collection despite high traffic?",
        "Identify stockout risks for the next 7 days",
    ];

    return (
        <div className="w-full max-w-4xl mx-auto mt-12 relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-400 to-orange-300 opacity-20 blur transition duration-500 group-hover:opacity-40"></div>
            <form
                onSubmit={handleDiagnose}
                className="relative bg-white/80 backdrop-blur-xl border border-gray-200/50 p-2 flex items-center shadow-sm"
            >
                <div className="p-4 text-gray-400">
                    <Search className="w-6 h-6" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-xl font-serif italic text-gray-800 placeholder-gray-400 px-4"
                    placeholder="Ask about revenue drops, stockouts, or trends..."
                />
                <button
                    type="submit"
                    disabled={!query.trim()}
                    className="bg-black text-white px-8 py-4 font-mono text-xs tracking-widest hover:bg-gray-800 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                    ASK <ArrowRight size={14} />
                </button>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="font-mono text-xs text-gray-400">SUGGESTIONS:</span>
                {suggestions.map((s, i) => (
                    <button
                        key={i}
                        onClick={() => navigate(`/dashboard/chat?q=${encodeURIComponent(s)}`)}
                        className="text-xs font-mono text-gray-500 hover:text-black hover:bg-gray-100 px-2 py-1 transition-colors border border-gray-200"
                    >
                        {s.length > 30 ? s.substring(0, 30) + '...' : s}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default DiagnosisSearchBar;

