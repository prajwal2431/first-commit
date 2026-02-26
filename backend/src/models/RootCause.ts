import mongoose, { Schema, Document, Model } from 'mongoose';

const evidenceSchema = new Schema(
  {
    dataSource: String,
    query: String,
    result: Schema.Types.Mixed,
  },
  { _id: false }
);

export interface IRootCause extends Document {
  anomalyId: string;
  hypothesisId: string;
  organizationId: string;
  description: string;
  confidenceScore: number;
  businessImpact: 'high' | 'medium' | 'low';
  contributingFactors: string[];
  evidenceChain: Array<{ dataSource: string; query: string; result: unknown }>;
  identifiedAt: Date;
}

const rootCauseSchema = new Schema<IRootCause>(
  {
    anomalyId: { type: String, required: true },
    hypothesisId: { type: String, required: true },
    organizationId: { type: String, required: true },
    description: { type: String, required: true },
    confidenceScore: { type: Number, required: true },
    businessImpact: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
    },
    contributingFactors: [{ type: String }],
    evidenceChain: [evidenceSchema],
    identifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const RootCause: Model<IRootCause> =
  mongoose.models.RootCause ?? mongoose.model<IRootCause>('RootCause', rootCauseSchema, 'root_causes');
