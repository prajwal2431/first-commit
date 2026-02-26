export interface Action {
    id: string;
    rootCauseId: string;
    anomalyId: string;
    actionType: 'replenish_inventory' | 'escalate_ops_issue' | 'investigate_sku_listing';
    title: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    suggestedOwner: string;
    assignedOwner?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
    icon?: string;
    context: Record<string, any>;
    createdAt: string;
    dueDate?: string;
    completedAt?: string;
}
