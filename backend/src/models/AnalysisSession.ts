import mongoose, { Schema, Document, Model } from 'mongoose';

export interface AnalysisStep {
  stage: number;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  detail?: string;
}

export interface AnalysisResultData {
  rootCauses: Array<{
    id: string;
    title: string;
    description: string;
    contribution: number;
    confidence: number;
    monitorType: string;
    contributingFactors: string[];
    evidence: Record<string, unknown>;
  }>;
  businessImpact: {
    lostRevenue: number;
    lostRevenueFormatted: string;
    conversionDrop: number;
    oosSkus: number;
    slaBreaches: number;
    stockAtHQ: number;
    stockAtTarget: number;
  };
  actions: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    effort: string;
    expectedImpact: string;
    owner: string;
    type: string;
  }>;
  geoOpportunity: {
    origin: string;
    originLabel: string;
    destination: string;
    destinationLabel: string;
    narrative: string;
  } | null;
  charts: {
    revenueVsTraffic: Array<{ date: string; revenue: number; traffic: number }>;
    externalFactors: Array<{ time: string; [key: string]: unknown }>;
  };
  memoMarkdown: string;
}

export interface IAnalysisSession extends Document {
  organizationId: string;
  query: string;
  signalId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: AnalysisStep[];
  result?: AnalysisResultData;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

const analysisSessionSchema = new Schema<IAnalysisSession>(
  {
    organizationId: { type: String, required: true },
    query: { type: String, required: true },
    signalId: String,
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    steps: { type: Schema.Types.Mixed, default: [] },
    result: { type: Schema.Types.Mixed },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    errorMessage: String,
  },
  { timestamps: true }
);

analysisSessionSchema.index({ organizationId: 1, startedAt: -1 });

export const AnalysisSession: Model<IAnalysisSession> =
  mongoose.models.AnalysisSession ??
  mongoose.model<IAnalysisSession>('AnalysisSession', analysisSessionSchema, 'analysis_sessions');
