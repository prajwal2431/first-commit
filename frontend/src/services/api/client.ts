const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('rca_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

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

async function readJsonOrThrowHtml(res: Response): Promise<any> {
    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text();

    if (!contentType.includes('application/json')) {
        const isHtml = bodyText.trimStart().startsWith('<!DOCTYPE') || bodyText.trimStart().startsWith('<html');
        if (isHtml) {
            throw new Error('API returned HTML instead of JSON. Check VITE_API_BASE_URL and Amplify/App Runner routing.');
        }
        throw new Error('API returned a non-JSON response.');
    }

    try {
        return JSON.parse(bodyText);
    } catch {
        throw new Error('API returned invalid JSON.');
    }
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options?.headers || {}),
    } as HeadersInit;

    const res = await fetch(url, {
        ...options,
        headers,
    });

    if (!res.ok) {
        let errorData;
        try {
            errorData = await readJsonOrThrowHtml(res);
        } catch {
            errorData = { message: 'Unknown error' };
        }
        throw new ApiError(res.status, errorData);
    }

    return readJsonOrThrowHtml(res) as Promise<T>;
}

export async function uploadFile<T = { dataSourceId: string; status: string; recordCount?: number }>(
    endpoint: string,
    file: File,
    fieldName = 'file'
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const form = new FormData();
    form.append(fieldName, file);
    const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: getAuthHeaders(),
    });
    if (!res.ok) {
        let errorData: { message?: string };
        try {
            errorData = await readJsonOrThrowHtml(res);
        } catch {
            errorData = { message: res.statusText || 'Upload failed' };
        }
        throw new ApiError(res.status, errorData);
    }
    return readJsonOrThrowHtml(res) as Promise<T>;
}
