import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, Network } from 'lucide-react';
import { useSidebarStore } from '@/stores/sidebarStore';
import { cn } from '@/lib/utils';

const SidebarNav: React.FC = () => {
    const { isOpen } = useSidebarStore();

    const navItems = [
        { to: '/dashboard/sources', label: 'Data Sources', icon: Network },
        { to: '/dashboard/intelligence', label: 'Intelligence', icon: MessageSquare },
    ];

    return (
        <div className={cn(
            "p-3 space-y-2 border-b border-gray-200/50",
            !isOpen && "mt-12 flex flex-col items-center"
        )}>
            {navItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => cn(
                        "w-full flex items-center gap-3 p-2 transition-all text-sm font-medium",
                        isActive
                            ? "bg-black text-white"
                            : "text-gray-600 hover:bg-gray-100 hover:text-black",
                        !isOpen && "justify-center"
                    )}
                    title={item.label}
                >
                    <item.icon size={18} className="shrink-0" />
                    {isOpen && item.label}
                </NavLink>
            ))}
        </div>
    );
};

export default SidebarNav;
