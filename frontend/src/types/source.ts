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
    /** User-submitted URL (e.g. Google Sheets link). Sent to the agent as sheet_url when chatting. */
    sourceUrl?: string;
}

export interface ConnectSourceRequest {
    name: string;
    type: string;
    credentials?: Record<string, string>;
}
