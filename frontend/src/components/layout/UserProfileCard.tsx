import React from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const UserProfileCard: React.FC = () => {
  const { isOpen } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

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

  return (
    <div className={cn(
      "p-3 m-2 border border-gray-200 bg-white/50 hover:bg-white transition-colors flex items-center gap-3",
      !isOpen && "justify-center"
    )}>
      <div className="w-8 h-8 bg-black flex items-center justify-center text-white shrink-0 font-serif italic text-xs">
        {initials}
      </div>
      {isOpen && (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {user?.tenant?.companyName ?? 'User'}
            </div>
            <div className="text-[10px] font-mono text-gray-500 truncate">
              {user?.tenant?.id?.toUpperCase() ?? ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 transition-colors shrink-0"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </>
      )}
    </div>
  );
};

export default UserProfileCard;
