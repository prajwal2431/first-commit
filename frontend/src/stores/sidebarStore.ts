import { create } from 'zustand';

interface SidebarState {
    isOpen: boolean;
    width: number;
    toggle: () => void;
    close: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
    isOpen: true,
    width: 280,
    toggle: () => set((state) => {
        const nextOpen = !state.isOpen;
        return {
            isOpen: nextOpen,
            width: nextOpen ? 280 : 72
        };
    }),
    close: () => set({ isOpen: false, width: 72 }),
}));
