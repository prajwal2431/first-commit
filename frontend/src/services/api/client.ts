const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
    status: number;
    data: any;

    constructor(status: number, data: any) {
        super(`API Error: ${status}`);
        this.status = status;
        this.data = data;
        this.name = 'ApiError';
    }
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
    } as HeadersInit;

    const res = await fetch(url, {
        ...options,
        headers,
    });

    if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch {
            errorData = { message: 'Unknown error' };
        }
        throw new ApiError(res.status, errorData);
    }

    return res.json() as Promise<T>;
}
