export interface DataSource {
    id: string;
    name: string;
    label?: string;
    type: string;
    domain?: string;
    mode?: string;
    status: 'connected' | 'syncing' | 'error' | 'disconnected';
    lastSync: string;
    icon?: string;
}

export interface ConnectSourceRequest {
    name: string;
    type: string;
    credentials?: Record<string, string>;
}
