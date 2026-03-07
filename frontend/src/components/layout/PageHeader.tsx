import { useLocation } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useAuthStore } from '@/stores/authStore';
import { MessageSquare, PanelRightClose } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PageHeader: React.FC = () => {
  const location = useLocation();
  const { isChatOpen, setChatOpen } = useChatStore();
  const { isOpen: isSidebarOpen } = useSidebarStore();
  const { user } = useAuthStore();

  const userInitials = user?.tenant?.companyName
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? 'U';

  const getSubTitle = () => {
    if (location.pathname.startsWith('/dashboard/sources')) return 'Connect';
    if (location.pathname.startsWith('/dashboard/signals')) return 'Signal Insight';
    if (location.pathname.startsWith('/dashboard/settings')) return 'Settings';
    if (location.pathname.startsWith('/dashboard/diagnosis')) return 'Diagnosis';
    return 'Intelligence';
  };

  return (
    <header className="w-full h-[60px] border-b border-gray-200/50 shrink-0 bg-[#FAFAFA]/80 backdrop-blur-md z-40 sticky top-0">
      <div className="w-full h-full flex items-center justify-between overflow-hidden">
        {/* Left side content */}
        <div className="flex-1 flex items-center h-full min-w-0 pl-4 md:pl-8">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-3">
              <span className="text-base font-sans font-black text-gray-900 tracking-tight">Real-time Pulse.</span>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-tighter">Live Monitor</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse shrink-0" />
              </div>
            </div>
            <div className="h-4 w-px bg-gray-300 hidden sm:block shrink-0"></div>
            <h1 className="text-base md:text-lg font-serif italic text-black m-0 leading-none truncate">
              Nexus {getSubTitle()}
            </h1>
          </div>
        </div>

        {/* Right side area - dynamically expands for chat */}
        <AnimatePresence mode="wait">
          {isChatOpen ? (
            <motion.div
              key="chat-header"
              initial={{ width: 0, opacity: 0 }}
              animate={{
                width: !isSidebarOpen ? '33.33%' : 380,
                opacity: 1
              }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.5, type: 'spring', damping: 25, stiffness: 200 }}
              className="h-full border-l border-gray-200 bg-white flex items-center justify-between px-6 relative flex-shrink-0"
            >
              <div className="flex items-center gap-3 min-w-0 px-1">
                <div className="w-7 h-7 bg-black flex items-center justify-center text-white shrink-0 font-serif italic text-[10px] ring-1 ring-black/5">
                  {userInitials}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="text-[9px] font-mono font-bold text-violet-600 uppercase tracking-widest leading-none">Diagnostic Engine</span>
                  <h3 className="text-sm font-sans font-black text-gray-900 leading-none truncate">Active Session</h3>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 transition-all rounded-none flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase shrink-0"
                title="Hide Chat"
              >
                <PanelRightClose size={14} /> <span className="hidden lg:inline">Minimize</span>
              </button>
            </motion.div>
          ) : (
            <div className="flex items-center h-full pr-4 md:pr-8">
              {!isChatOpen && location.pathname.includes('/dashboard/intelligence') && (
                <button
                  onClick={() => setChatOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-mono font-bold uppercase hover:bg-gray-800 transition-transform hover:scale-105 active:scale-95 shadow-lg group"
                >
                  <MessageSquare size={14} className="group-hover:animate-bounce" /> Ask Nex
                </button>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export default PageHeader;
