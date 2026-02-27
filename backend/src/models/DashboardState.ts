import mongoose, { Schema, Document, Model } from 'mongoose';

export interface LiveSignal {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  monitorType: 'revenue' | 'inventory' | 'operations' | 'demand';
  title: string;
  description: string;
  suggestedQuery: string;
  evidenceSnippet: string;
  detectedAt: Date;
}

export interface KpiSummary {
  totalRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number;
  totalOrders: number;
  ordersDelta: number;
  avgOrderValue: number;
  aovDelta: number;
  oosRate: number;
  oosDelta: number;
  returnRate: number;
  returnDelta: number;
  slaAdherence: number;
  slaDelta: number;
}

export interface RevenueSeriesPoint {
  date: string;
  revenue: number;
  traffic: number;
  orders: number;
}

export interface IDashboardState extends Document {
  organizationId: string;
  revenueAtRiskSeries: RevenueSeriesPoint[];
  liveSignals: LiveSignal[];
  kpiSummary: KpiSummary;
  lastComputedAt: Date;
}

const dashboardStateSchema = new Schema<IDashboardState>(
  {
    organizationId: { type: String, required: true, unique: true },
    revenueAtRiskSeries: { type: Schema.Types.Mixed, default: [] },
    liveSignals: { type: Schema.Types.Mixed, default: [] },
    kpiSummary: { type: Schema.Types.Mixed, default: {} },
    lastComputedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const DashboardState: Model<IDashboardState> =
  mongoose.models.DashboardState ??
  mongoose.model<IDashboardState>('DashboardState', dashboardStateSchema, 'dashboard_states');
