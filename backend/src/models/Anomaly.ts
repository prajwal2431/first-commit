import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAnomaly extends Document {
  organizationId: string;
  kpiName: string;
  detectedAt: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  dimensions: Record<string, string>;
  status: 'detected' | 'analyzing' | 'resolved' | 'dismissed';
  resolvedAt?: Date;
}

const anomalySchema = new Schema<IAnomaly>(
  {
    organizationId: { type: String, required: true },
    kpiName: { type: String, required: true },
    detectedAt: { type: Date, default: Date.now },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      required: true,
    },
    currentValue: { type: Number, required: true },
    expectedValue: { type: Number, required: true },
    deviationPercent: { type: Number, required: true },
    dimensions: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['detected', 'analyzing', 'resolved', 'dismissed'],
      default: 'detected',
    },
    resolvedAt: Date,
  },
  { timestamps: true }
);

anomalySchema.index({ status: 1, detectedAt: -1 });
anomalySchema.index({ status: 1, severity: 1, detectedAt: -1 });

export const Anomaly: Model<IAnomaly> =
  mongoose.models.Anomaly ?? mongoose.model<IAnomaly>('Anomaly', anomalySchema, 'anomalies');
