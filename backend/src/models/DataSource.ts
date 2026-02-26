import mongoose, { Schema, Document, Model } from 'mongoose';

const connectionConfigSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['snowflake', 'bigquery', 'redshift', 'generic_jdbc'],
      required: true,
    },
    endpoint: String,
    database: String,
    schema: String,
    tablesOrViews: [String],
  },
  { _id: false }
);

const columnMappingSchema = new Schema(
  {
    sourceColumn: { type: String, required: true },
    targetColumn: { type: String, required: true },
    confidence: { type: Number, required: true },
    mappingMethod: {
      type: String,
      enum: ['exact', 'fuzzy', 'ai', 'manual'],
      required: true,
    },
  },
  { _id: false }
);

const qualityIssueSchema = new Schema(
  {
    id: String,
    sourceId: String,
    severity: { type: String, enum: ['critical', 'warning', 'info'] },
    message: String,
    field: String,
  },
  { _id: false }
);

export interface IDataSource extends Document {
  userId: string;
  organizationId: string;
  fileName: string;
  fileType: 'excel' | 'csv' | 'marketplace' | 'data_warehouse';
  uploadedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recordCount?: number;
  errorMessage?: string;
  columnMappings?: Array<{
    sourceColumn: string;
    targetColumn: string;
    confidence: number;
    mappingMethod: 'exact' | 'fuzzy' | 'ai' | 'manual';
  }>;
  qualityIssues?: Array<{
    id?: string;
    sourceId?: string;
    severity: 'critical' | 'warning' | 'info';
    message?: string;
    field?: string;
  }>;
  connectionConfig?: {
    type: 'snowflake' | 'bigquery' | 'redshift' | 'generic_jdbc';
    endpoint?: string;
    database?: string;
    schema?: string;
    tablesOrViews?: string[];
  };
  lastSyncAt?: Date;
}

const dataSourceSchema = new Schema<IDataSource>(
  {
    userId: { type: String, required: true },
    organizationId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: {
      type: String,
      enum: ['excel', 'csv', 'marketplace', 'data_warehouse'],
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    recordCount: Number,
    errorMessage: String,
    columnMappings: [columnMappingSchema],
    qualityIssues: [qualityIssueSchema],
    connectionConfig: connectionConfigSchema,
    lastSyncAt: Date,
  },
  { timestamps: true }
);

export const DataSource: Model<IDataSource> =
  mongoose.models.DataSource ?? mongoose.model<IDataSource>('DataSource', dataSourceSchema, 'data_sources');
