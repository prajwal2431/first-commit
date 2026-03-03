import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProactiveRun extends Document {
    organizationId: string;
    triggerType: string;
    status: 'running' | 'completed' | 'failed' | 'skipped';
    briefId?: string; // ObjectId reference to ProactiveBrief
    startedAt: Date;
    completedAt?: Date;
    signalSnapshot: string[]; // signal IDs present at time of run
    escalationLevel: number; // 0 = initial, 1+ = escalated
    errorMessage?: string;
}

const proactiveRunSchema = new Schema<IProactiveRun>(
    {
        organizationId: { type: String, required: true, index: true },
        triggerType: { type: String, required: true },
        status: {
            type: String,
            required: true,
            enum: ['running', 'completed', 'failed', 'skipped'],
            default: 'running',
        },
        briefId: { type: String, default: null },
        startedAt: { type: Date, required: true, default: Date.now },
        completedAt: { type: Date, default: null },
        signalSnapshot: { type: [String], default: [] },
        escalationLevel: { type: Number, default: 0 },
        errorMessage: { type: String, default: null },
    },
    { timestamps: true }
);

// For throttle lookups: "latest run for this org of this trigger type"
proactiveRunSchema.index({ organizationId: 1, triggerType: 1, startedAt: -1 });

export const ProactiveRun: Model<IProactiveRun> =
    mongoose.models.ProactiveRun ??
    mongoose.model<IProactiveRun>('ProactiveRun', proactiveRunSchema, 'proactive_runs');
