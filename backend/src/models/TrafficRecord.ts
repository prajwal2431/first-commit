import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITrafficRecord extends Document {
  sourceId: string;
  organizationId: string;
  date: Date;
  channel: string;
  sku: string;
  sessions: number;
  impressions: number;
  clicks: number;
  spend: number;
  createdAt: Date;
}

const trafficRecordSchema = new Schema<ITrafficRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    date: { type: Date, required: true },
    channel: { type: String, default: '' },
    sku: { type: String, default: '' },
    sessions: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
  },
  { timestamps: true }
);

trafficRecordSchema.index({ sourceId: 1, date: 1 });
trafficRecordSchema.index({ organizationId: 1, date: 1 });

export const TrafficRecord: Model<ITrafficRecord> =
  mongoose.models.TrafficRecord ??
  mongoose.model<ITrafficRecord>('TrafficRecord', trafficRecordSchema, 'traffic_records');
