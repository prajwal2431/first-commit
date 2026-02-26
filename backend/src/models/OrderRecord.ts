import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrderRecord extends Document {
  sourceId: string;
  organizationId: string;
  order_id: string;
  sku: string;
  quantity: number;
  revenue: number;
  date: Date;
  region: string;
  createdAt: Date;
}

const orderRecordSchema = new Schema<IOrderRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    order_id: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true },
    revenue: { type: Number, required: true },
    date: { type: Date, required: true },
    region: { type: String, required: true },
  },
  { timestamps: true }
);

orderRecordSchema.index({ sku: 1, date: 1, region: 1 });

export const OrderRecord: Model<IOrderRecord> =
  mongoose.models.OrderRecord ?? mongoose.model<IOrderRecord>('OrderRecord', orderRecordSchema, 'orders');
