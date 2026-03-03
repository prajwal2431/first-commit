import mongoose, { Schema, Document, Model } from 'mongoose';

/* ── Sub-interfaces ──────────────────────────────────────────────── */

export interface BriefRootCause {
    cause: string;
    confidence: number; // 0-100
    evidence: string;
}

export interface BriefAction {
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    owner?: string;
}

export interface BriefPrediction {
    metric: string;
    projected: number;
    target: number;
    gap: number;
    timeframe: string; // e.g. "next 7 days"
}

export interface CorrelatedSignalRef {
    signalId: string;
    title: string;
}

export interface BriefContent {
    title: string;
    summary: string;
    rootCauses: BriefRootCause[];
    actions: BriefAction[];
    suggestedQuestions: string[];
    prediction?: BriefPrediction;
    correlatedSignals?: CorrelatedSignalRef[];
}

export interface EngagementStats {
    opened: boolean;
    questionsClicked: string[];
    viewedInApp: boolean;
}

/* ── Document interface ──────────────────────────────────────────── */

export type ProactiveTriggerType =
    | 'signal'
    | 'scheduled'
    | 'trend_drift'
    | 'correlation'
    | 'prediction'
    | 'escalation';

export interface IProactiveBrief extends Document {
    organizationId: string;
    triggerType: ProactiveTriggerType;
    content: BriefContent;
    sourceSignalIds: string[];
    emailedAt?: Date;
    recipientCount?: number;
    engagementStats?: EngagementStats;
    createdAt: Date;
    updatedAt: Date;
}

/* ── Schema ──────────────────────────────────────────────────────── */

const proactiveBriefSchema = new Schema<IProactiveBrief>(
    {
        organizationId: { type: String, required: true, index: true },
        triggerType: {
            type: String,
            required: true,
            enum: ['signal', 'scheduled', 'trend_drift', 'correlation', 'prediction', 'escalation'],
        },
        content: {
            type: Schema.Types.Mixed,
            required: true,
            default: {
                title: '',
                summary: '',
                rootCauses: [],
                actions: [],
                suggestedQuestions: [],
            },
        },
        sourceSignalIds: { type: [String], default: [] },
        emailedAt: { type: Date, default: null },
        recipientCount: { type: Number, default: 0 },
        engagementStats: {
            type: Schema.Types.Mixed,
            default: { opened: false, questionsClicked: [], viewedInApp: false },
        },
    },
    { timestamps: true }
);

// Index for fast "latest brief per org" queries
proactiveBriefSchema.index({ organizationId: 1, createdAt: -1 });

export const ProactiveBrief: Model<IProactiveBrief> =
    mongoose.models.ProactiveBrief ??
    mongoose.model<IProactiveBrief>('ProactiveBrief', proactiveBriefSchema, 'proactive_briefs');
