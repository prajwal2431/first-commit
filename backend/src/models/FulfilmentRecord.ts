import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFulfilmentRecord extends Document {
  sourceId: string;
  organizationId: string;
  order_id: string;
  sku: string;
  dispatch_date: Date;
  delivery_date?: Date;
  expected_delivery_date?: Date;
  delay_days: number;
  carrier: string;
  warehouse: string;
  region: string;
  status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto';
  createdAt: Date;
}

const fulfilmentRecordSchema = new Schema<IFulfilmentRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    order_id: { type: String, required: true },
    sku: { type: String, default: '' },
    dispatch_date: { type: Date, required: true },
    delivery_date: Date,
    expected_delivery_date: Date,
    delay_days: { type: Number, default: 0 },
    carrier: { type: String, default: '' },
    warehouse: { type: String, default: '' },
    region: { type: String, default: '' },
    status: {
      type: String,
      enum: ['dispatched', 'delivered', 'returned', 'cancelled', 'rto'],
      default: 'dispatched',
    },
  },
  { timestamps: true }
);

fulfilmentRecordSchema.index({ sourceId: 1, dispatch_date: 1 });
fulfilmentRecordSchema.index({ organizationId: 1, dispatch_date: 1 });
fulfilmentRecordSchema.index({ order_id: 1 });

export const FulfilmentRecord: Model<IFulfilmentRecord> =
  mongoose.models.FulfilmentRecord ??
  mongoose.model<IFulfilmentRecord>('FulfilmentRecord', fulfilmentRecordSchema, 'fulfilment_records');
