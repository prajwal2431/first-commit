type SSEHandler = (data: any) => void;

class SSEClient {
    private eventSource: EventSource | null = null;
    private handlers: Map<string, SSEHandler[]> = new Map();
    private reconnectTimeout: any = null;
    private url: string = '';

    constructor() {
        this.url = import.meta.env.VITE_SSE_URL || 'http://localhost:3000/api/events/stream';
    }

    connect() {
        if (this.eventSource) return;

        try {
            this.eventSource = new EventSource(this.url);

            this.eventSource.onopen = () => {
                console.log('SSE Connected');
                this.emit('connection_change', { status: 'connected' });
            };

            this.eventSource.onerror = (err) => {
                console.error('SSE Error:', err);
                this.emit('connection_change', { status: 'error', error: 'Connection failed' });
                this.reconnect();
            };

            // General message handler
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.emit('message', data);
                    if (data.type) {
                        this.emit(data.type, data);
                    }
                } catch (e) {
                    console.error('Error parsing SSE message', e);
                }
            };
        } catch (e) {
            console.error('SSE initialization failed', e);
        }
    }

    private reconnect() {
        this.disconnect();
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.emit('connection_change', { status: 'disconnected' });
    }

    on(event: string, handler: SSEHandler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event)?.push(handler);
    }

    off(event: string, handler: SSEHandler) {
        const eventHandlers = this.handlers.get(event);
        if (!eventHandlers) return;
        this.handlers.set(event, eventHandlers.filter(h => h !== handler));
    }

    private emit(event: string, data: any) {
        this.handlers.get(event)?.forEach(handler => handler(data));
    }
}

export const sseClient = new SSEClient();
