import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Stores one row from an uploaded file as-is. Headers become keys in `data`;
 * no schema validation — whatever is in the file is stored.
 */
export interface IRawIngestionRecord extends Document {
  sourceId: string;
  organizationId: string;
  rowIndex: number;
  data: Record<string, unknown>;
  createdAt: Date;
}

const rawIngestionRecordSchema = new Schema<IRawIngestionRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    rowIndex: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, strict: false }
);

rawIngestionRecordSchema.index({ sourceId: 1, rowIndex: 1 });

export const RawIngestionRecord: Model<IRawIngestionRecord> =
  mongoose.models.RawIngestionRecord ??
  mongoose.model<IRawIngestionRecord>( 'RawIngestionRecord', rawIngestionRecordSchema, 'raw_ingestion_records' );
