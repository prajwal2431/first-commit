export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    citations?: Citation[];
}

export interface Citation {
    dataSource: string;
    query: string;
    confidence: number;
}
