import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInventoryRecord extends Document {
  sourceId: string;
  organizationId: string;
  sku: string;
  location: string;
  available_qty: number;
  date: Date;
  createdAt: Date;
}

const inventoryRecordSchema = new Schema<IInventoryRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    sku: { type: String, required: true },
    location: { type: String, required: true },
    available_qty: { type: Number, required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

inventoryRecordSchema.index({ sku: 1, location: 1, date: 1 });

export const InventoryRecord: Model<IInventoryRecord> =
  mongoose.models.InventoryRecord ??
  mongoose.model<IInventoryRecord>('InventoryRecord', inventoryRecordSchema, 'inventory');
