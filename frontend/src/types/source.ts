export interface DataSource {
    id: string;
    name: string;
    type: string;
    status: 'connected' | 'syncing' | 'error' | 'disconnected';
    lastSync: string;
    icon?: string;
}

export interface ConnectSourceRequest {
    name: string;
    type: string;
    credentials?: Record<string, string>;
}
