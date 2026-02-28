import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
        renameSession,
        fetchSessions
    } = useSessionStore();

    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState<string>('');
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

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

    const handleDeleteClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSessionToDelete(id);
        setOpenMenuId(null);
    };

    const confirmDelete = async () => {
        if (!sessionToDelete) return;
        setIsDeleting(true);
        try {
            await deleteSession(sessionToDelete);
            if (activeSessionId === sessionToDelete) {
                navigate('/dashboard/intelligence');
            }
        } finally {
            setIsDeleting(false);
            setSessionToDelete(null);
        }
    };

    const handleRenameClick = (id: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingSessionId(id);
        setEditTitle(currentTitle);
        setOpenMenuId(null);
    };

    const handleRenameSubmit = async (id: string, e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (editTitle.trim()) {
            await renameSession(id, editTitle.trim());
        }
        setEditingSessionId(null);
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === 'Enter') {
            handleRenameSubmit(id);
        } else if (e.key === 'Escape') {
            setEditingSessionId(null);
        }
    };

    const handleSessionClick = (id: string) => {
        setActiveSession(id);
        navigate(`/dashboard/intelligence/${id}`);
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
                                <div className="truncate flex-1 pr-6 flex items-center h-full">
                                    {editingSessionId === sess.id ? (
                                        <input
                                            type="text"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onKeyDown={(e) => handleRenameKeyDown(e, sess.id)}
                                            onBlur={() => handleRenameSubmit(sess.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            autoFocus
                                            className="w-full bg-white border border-gray-300 rounded-none px-1 py-0.5 text-sm outline-none text-black"
                                        />
                                    ) : (
                                        sess.query
                                    )}
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
                                                onClick={(e) => handleRenameClick(sess.id, sess.query, e)}
                                            >
                                                <Edit2 size={12} /> Rename
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(sess.id, e)}
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

            {sessionToDelete && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-none shadow-xl w-full max-w-md p-6 border border-gray-200 text-left font-mono animate-in fade-in zoom-in-95 duration-200">
                        <h2 className="text-xl font-serif italic text-black mb-4">DELETE CHAT?</h2>
                        <div className="text-xs text-gray-600 mb-6 leading-relaxed tracking-wide uppercase">
                            <p className="mb-4">
                                This will delete queries, responses and feedback from your activity, plus any content that you created during this chat.
                            </p>
                            <a href="#" onClick={(e) => e.preventDefault()} className="font-medium text-black hover:text-gray-600 hover:underline">
                                [ Learn more ]
                            </a>
                        </div>
                        <div className="flex justify-end gap-3 mt-4 text-xs tracking-wider uppercase">
                            <button
                                onClick={() => setSessionToDelete(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-none transition-colors border border-transparent"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={isDeleting}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-none transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SessionHistory;
