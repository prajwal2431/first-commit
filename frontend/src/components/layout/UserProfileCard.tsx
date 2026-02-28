import React, { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, ChevronUp, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

const UserProfileCard: React.FC = () => {
  const { isOpen } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = user?.tenant?.companyName
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '??';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menu when sidebar toggles to avoid weird positioning jumps
  useEffect(() => {
    setShowMenu(false);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative mt-auto">
      {/* Dropdown Menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute bg-white border border-gray-200 shadow-xl z-50",
              isOpen
                ? "bottom-full left-2 right-2 mb-1"
                : "bottom-8 left-full ml-4 w-48 rounded-md"
            )}
          >
            <button
              onClick={() => { navigate('/dashboard/settings'); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-black transition-colors"
            >
              <Settings size={14} className="shrink-0" />
              <span>Settings</span>
            </button>
            <div className="border-t border-gray-100" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={14} className="shrink-0" />
              <span>Sign Out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={cn(
          "w-[calc(100%-16px)] mx-2 mb-2 p-3 border border-gray-200 bg-white/50 hover:bg-white transition-colors flex items-center gap-3 cursor-pointer",
          !isOpen && "justify-center"
        )}
        title={!isOpen ? "Profile & Settings" : undefined}
      >
        <div className="w-8 h-8 bg-black flex items-center justify-center text-white shrink-0 font-serif italic text-xs">
          {initials !== '??' ? initials : <User size={14} />}
        </div>
        {isOpen && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {user?.tenant?.companyName ?? 'User'}
              </div>
              <div className="text-[10px] font-mono text-gray-500 truncate">
                {user?.tenant?.id?.toUpperCase() ?? ''}
              </div>
            </div>
            <ChevronUp
              size={14}
              className={cn(
                "text-gray-400 transition-transform duration-200 shrink-0",
                showMenu ? "rotate-0" : "rotate-180"
              )}
            />
          </>
        )}
      </button>
    </div>
  );
};

export default UserProfileCard;
