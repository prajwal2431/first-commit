import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Daily retail performance record (supports 30–60+ days of historical data).
 */
export interface IRetailRecord extends Document {
  sourceId: string;
  organizationId: string;
  date: Date;
  sku: string;
  revenue: number;
  units: number;
  traffic: number;
  inventory: number;
  returns: number;
  createdAt: Date;
}

const retailRecordSchema = new Schema<IRetailRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    date: { type: Date, required: true },
    sku: { type: String, required: true },
    revenue: { type: Number, required: true, default: 0 },
    units: { type: Number, required: true, default: 0 },
    traffic: { type: Number, required: true, default: 0 },
    inventory: { type: Number, required: true, default: 0 },
    returns: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

retailRecordSchema.index({ sourceId: 1, date: 1, sku: 1 });
retailRecordSchema.index({ organizationId: 1, date: 1 });

export const RetailRecord: Model<IRetailRecord> =
  mongoose.models.RetailRecord ??
  mongoose.model<IRetailRecord>('RetailRecord', retailRecordSchema, 'retail_records');
