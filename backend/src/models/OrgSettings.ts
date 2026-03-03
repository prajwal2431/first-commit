import mongoose, { Schema, Document, Model } from 'mongoose';

export interface Department {
    id: string;
    name: string;
    email: string;
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
}

export interface SignalThresholds {
    // Revenue monitors
    revenueDropWoW: number;        // % weekly rev drop to fire signal (default 15)
    revenueDropDoD: number;        // % daily rev drop to fire signal (default 10)
    trafficUpCvrDown: {
        trafficDelta: number;      // % traffic up (default 10)
        revenueDelta: number;      // % revenue down (default -10)
    };
    aovCollapse: number;           // % AOV drop (default 15)
    topSkuRevenueDrop: number;     // % per-SKU rev drop (default 20)

    // Inventory monitors
    oosRateCritical: number;       // % OOS rate → critical (default 10)
    oosRateWarning: number;        // % OOS rate → warning (default 5)

    // Operations monitors
    returnRateWarning: number;     // % (default 5)
    returnRateCritical: number;    // % (default 15)
    slaAdherenceWarning: number;   // % below → warning (default 90)
    slaAdherenceCritical: number;  // % below → critical (default 80)
    cancelRateWarning: number;     // % (default 3)
    cancelRateCritical: number;    // % (default 10)
    rtoRateWarning: number;       // % (default 8)
    rtoRateCritical: number;      // % (default 15)

    // Demand monitors
    demandSpikeStdDevMultiplier: number;  // σ multiplier for aggregate spikes (default 2.0)
    skuSpikeStdDevMultiplier: number;     // σ multiplier for SKU-level spikes (default 2.5)
    skuSpikeMinMultiplier: number;        // min Nx average units (default 2.0)
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
    revenueDropWoW: 15,
    revenueDropDoD: 10,
    trafficUpCvrDown: { trafficDelta: 10, revenueDelta: -10 },
    aovCollapse: 15,
    topSkuRevenueDrop: 20,

    oosRateCritical: 10,
    oosRateWarning: 5,

    returnRateWarning: 5,
    returnRateCritical: 15,
    slaAdherenceWarning: 90,
    slaAdherenceCritical: 80,
    cancelRateWarning: 3,
    cancelRateCritical: 10,
    rtoRateWarning: 8,
    rtoRateCritical: 15,

    demandSpikeStdDevMultiplier: 2.0,
    skuSpikeStdDevMultiplier: 2.5,
    skuSpikeMinMultiplier: 2.0,
};

export interface ProactiveConfig {
    enabled: boolean;
    alertEmails: string[];           // primary recipients
    escalationEmails: string[];      // escalation tier recipients
    scheduledBriefTime: string;      // cron expression, default '0 6 * * *'
    throttleMinutes: number;         // min gap between signal-triggered runs, default 30
    escalationHours: number;         // hours before unresolved critical escalates, default 4
    enableTrendDetection: boolean;
    enablePredictions: boolean;
    enableSuggestedQuestions: boolean;
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
    enabled: false,
    alertEmails: [],
    escalationEmails: [],
    scheduledBriefTime: '0 6 * * *',
    throttleMinutes: 30,
    escalationHours: 4,
    enableTrendDetection: true,
    enablePredictions: true,
    enableSuggestedQuestions: true,
};

export interface IOrgSettings extends Document {
    organizationId: string;
    departments: Department[];
    smtp: SmtpConfig | null;
    thresholds: SignalThresholds;
    proactiveConfig?: ProactiveConfig;
    createdAt: Date;
    updatedAt: Date;
}

const orgSettingsSchema = new Schema<IOrgSettings>(
    {
        organizationId: { type: String, required: true, unique: true },
        departments: {
            type: [
                {
                    id: { type: String, required: true },
                    name: { type: String, required: true },
                    email: { type: String, required: true },
                },
            ],
            default: [
                { id: 'supply-chain', name: 'Supply Chain', email: '' },
                { id: 'marketing', name: 'Marketing', email: '' },
                { id: 'finance', name: 'Finance', email: '' },
                { id: 'operations', name: 'Operations', email: '' },
                { id: 'product', name: 'Product', email: '' },
                { id: 'cx', name: 'Customer Experience', email: '' },
                { id: 'tech', name: 'Tech', email: '' },
            ],
        },
        smtp: { type: Schema.Types.Mixed, default: null },
        thresholds: {
            type: Schema.Types.Mixed,
            default: () => ({ ...DEFAULT_THRESHOLDS }),
        },
        proactiveConfig: {
            type: Schema.Types.Mixed,
            default: () => ({ ...DEFAULT_PROACTIVE_CONFIG }),
        },
    },
    { timestamps: true }
);

export const OrgSettings: Model<IOrgSettings> =
    mongoose.models.OrgSettings ??
    mongoose.model<IOrgSettings>('OrgSettings', orgSettingsSchema, 'org_settings');
