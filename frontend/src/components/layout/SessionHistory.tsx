import React, { useState, useEffect } from 'react';
import { MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { useSidebarStore } from '@/stores/sidebarStore';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/sessionStore';
import { useNavigate } from 'react-router-dom';

const SessionHistory: React.FC = () => {
    const { isOpen } = useSidebarStore();
    const navigate = useNavigate();
    const {
        sessions,
        activeSessionId,
        setActiveSession,
        deleteSession,
        fetchSessions
    } = useSessionStore();

    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Close menu on outside click
    useEffect(() => {
        const closeMenu = () => setOpenMenuId(null);
        document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, []);

    const handleMenuClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === id ? null : id);
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteSession(id);
        setOpenMenuId(null);
    };

    const handleSessionClick = (id: string) => {
        setActiveSession(id);
        navigate(`/diagnosis/${id}`);
    };

    if (!isOpen) return null;

    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6">
            <div>
                <div className="text-[10px] font-mono tracking-widest text-gray-400 px-2 pb-2 uppercase">[ HISTORY ]</div>
                <div className="space-y-1">
                    {sessions.map(sess => {
                        const isActive = activeSessionId === sess.id;
                        const isMenuOpen = openMenuId === sess.id;

                        return (
                            <div
                                key={sess.id}
                                className={cn(
                                    "group relative flex items-center h-10 px-2 cursor-pointer text-sm transition-colors",
                                    isActive ? "bg-gray-100 text-black" : "hover:bg-gray-100 text-gray-700"
                                )}
                                onClick={() => handleSessionClick(sess.id)}
                            >
                                <div className="truncate flex-1 pr-6">
                                    {sess.query}
                                </div>

                                <div className={cn(
                                    "absolute right-1 top-1 bottom-1 flex items-center pl-4",
                                    (isActive || isMenuOpen)
                                        ? 'bg-gradient-to-l from-gray-100 via-gray-100 to-transparent opacity-100'
                                        : 'opacity-0 group-hover:opacity-100 bg-gradient-to-l from-gray-100 via-gray-100 to-transparent'
                                )}>
                                    <button
                                        onClick={(e) => handleMenuClick(sess.id, e)}
                                        className="p-1.5 text-gray-500 hover:text-black transition-colors"
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>

                                    {isMenuOpen && (
                                        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 shadow-xl py-1 z-50 flex flex-col font-mono text-xs text-gray-700">
                                            <button
                                                className="px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
                                                onClick={(e) => { e.stopPropagation(); /* Rename logic */ }}
                                            >
                                                <Edit2 size={12} /> Rename
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(sess.id, e)}
                                                className="px-3 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                                            >
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SessionHistory;
