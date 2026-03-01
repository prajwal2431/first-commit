import { useAuthStore } from './authStore';

export const tenantStorage = {
    getItem: (name: string) => {
        const tenantId = useAuthStore.getState().user?.tenant?.id || 'default';
        return localStorage.getItem(`${name}-${tenantId}`);
    },
    setItem: (name: string, value: string) => {
        const tenantId = useAuthStore.getState().user?.tenant?.id || 'default';
        localStorage.setItem(`${name}-${tenantId}`, value);
    },
    removeItem: (name: string) => {
        const tenantId = useAuthStore.getState().user?.tenant?.id || 'default';
        localStorage.removeItem(`${name}-${tenantId}`);
    }
};
