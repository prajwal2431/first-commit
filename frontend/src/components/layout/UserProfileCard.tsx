import React from 'react';
import { useSidebarStore } from '@/stores/sidebarStore';
import { cn } from '@/lib/utils';

const UserProfileCard: React.FC = () => {
    const { isOpen } = useSidebarStore();

    return (
        <div className={cn(
            "p-3 m-2 border border-gray-200 bg-white/50 hover:bg-white transition-colors cursor-pointer flex items-center gap-3",
            !isOpen && "justify-center"
        )}>
            <div className="w-8 h-8 bg-black flex items-center justify-center text-white shrink-0 font-serif italic">
                BC
            </div>
            {isOpen && (
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">Admin Ops</div>
                    <div className="text-[10px] font-mono text-gray-500 truncate">PRO PLAN</div>
                </div>
            )}
        </div>
    );
};

export default UserProfileCard;
