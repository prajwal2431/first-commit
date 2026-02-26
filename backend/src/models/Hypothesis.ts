import mongoose, { Schema, Document, Model } from 'mongoose';

const testCriterionSchema = new Schema(
  {
    dataSource: String,
    query: String,
    expectedResult: String,
  },
  { _id: false }
);

export interface IHypothesis extends Document {
  anomalyId: string;
  organizationId: string;
  description: string;
  expectedEvidence: string[];
  testCriteria: Array<{ dataSource: string; query: string; expectedResult: string }>;
  status: 'pending' | 'testing' | 'confirmed' | 'rejected';
  confidenceScore?: number;
  generatedAt: Date;
  testedAt?: Date;
}

const hypothesisSchema = new Schema<IHypothesis>(
  {
    anomalyId: { type: String, required: true },
    organizationId: { type: String, required: true },
    description: { type: String, required: true },
    expectedEvidence: [{ type: String }],
    testCriteria: [testCriterionSchema],
    status: {
      type: String,
      enum: ['pending', 'testing', 'confirmed', 'rejected'],
      default: 'pending',
    },
    confidenceScore: Number,
    generatedAt: { type: Date, default: Date.now },
    testedAt: Date,
  },
  { timestamps: true }
);

export const Hypothesis: Model<IHypothesis> =
  mongoose.models.Hypothesis ?? mongoose.model<IHypothesis>('Hypothesis', hypothesisSchema, 'hypotheses');
