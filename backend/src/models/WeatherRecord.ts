import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWeatherRecord extends Document {
  sourceId: string;
  organizationId: string;
  date: Date;
  region: string;
  temp_min: number;
  temp_max: number;
  rainfall_mm: number;
  humidity: number;
  createdAt: Date;
}

const weatherRecordSchema = new Schema<IWeatherRecord>(
  {
    sourceId: { type: String, required: true },
    organizationId: { type: String, required: true },
    date: { type: Date, required: true },
    region: { type: String, required: true },
    temp_min: { type: Number, default: 0 },
    temp_max: { type: Number, default: 0 },
    rainfall_mm: { type: Number, default: 0 },
    humidity: { type: Number, default: 0 },
  },
  { timestamps: true }
);

weatherRecordSchema.index({ organizationId: 1, date: 1, region: 1 });

export const WeatherRecord: Model<IWeatherRecord> =
  mongoose.models.WeatherRecord ??
  mongoose.model<IWeatherRecord>('WeatherRecord', weatherRecordSchema, 'weather_records');
