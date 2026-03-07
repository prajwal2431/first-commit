/**
 * Shared TypeScript interfaces for DynamoDB items.
 * No Mongoose Document; dates stored as ISO strings in DynamoDB.
 */

// ----- Tenant & User -----
export interface ITenant {
  tenantId: string;
  companyName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IUser {
  userId: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  role: 'admin' | 'member';
  createdAt?: string;
  updatedAt?: string;
}

// ----- DataSource -----
export type DataSourceFileType = 'excel' | 'csv' | 'marketplace' | 'data_warehouse' | 'api' | 'sheets' | 'integration';
export type DataSourceStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'connected' | 'syncing' | 'disconnected';

export interface IDataSource {
  organizationId: string;
  sourceId: string;
  userId: string;
  fileName?: string;
  fileType: DataSourceFileType;
  label?: string;
  domain?: string;
  mode?: string;
  uploadedAt: string;
  status: DataSourceStatus;
  recordCount?: number;
  errorMessage?: string;
  columnMappings?: Array<{ sourceColumn: string; targetColumn: string; confidence: number; mappingMethod: string }>;
  qualityIssues?: Array<{ id?: string; sourceId?: string; severity: string; message?: string; field?: string }>;
  connectionConfig?: {
    type: string;
    endpoint?: string;
    database?: string;
    schema?: string;
    tablesOrViews?: string[];
  };
  sheetsUrl?: string;
  lastSyncAt?: string;
  sourceUrl?: string;
}

// ----- Record types -----
export interface IRetailRecord {
  organizationId: string;
  sk: string; // date#sourceId#sku
  sourceId: string;
  date: string;
  sku: string;
  revenue: number;
  units: number;
  traffic: number;
  inventory: number;
  returns: number;
}

export interface IOrderRecord {
  organizationId: string;
  sk: string; // date#orderId
  sourceId: string;
  date: string;
  order_id: string;
  sku: string;
  quantity: number;
  revenue: number;
  region: string;
}

export interface IInventoryRecord {
  organizationId: string;
  sk: string; // sku#location#date or sourceId#sku#location
  sourceId: string;
  sku: string;
  location: string;
  available_qty: number;
  date: string;
}

export interface IFulfilmentRecord {
  organizationId: string;
  sk: string; // dispatch_date#order_id
  sourceId: string;
  order_id: string;
  sku?: string;
  dispatch_date: string;
  delivery_date?: string;
  expected_delivery_date?: string;
  delay_days: number;
  carrier: string;
  warehouse: string;
  region: string;
  status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto';
}

export interface ITrafficRecord {
  organizationId: string;
  sk: string; // date#sourceId
  sourceId: string;
  date: string;
  channel: string;
  sku: string;
  sessions: number;
  impressions: number;
  clicks: number;
  spend: number;
}

export interface IWeatherRecord {
  organizationId: string;
  sk: string; // date#region
  date: string;
  region: string;
  temp_min: number;
  temp_max: number;
  rainfall_mm: number;
  humidity: number;
}

export interface IRawIngestionRecord {
  sourceId: string;
  rowIndex: number;
  data: Record<string, unknown>;
}

// ----- Dashboard & OrgSettings -----
export interface SignalImpact {
  revenueAtRisk?: number;
  marginAtRisk?: number;
  unitsAtRisk?: number;
  ordersAtRisk?: number;
  confidence: number;
  drivers: Array<{ driver: string; contribution: number }>;
}

export interface LiveSignal {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  monitorType: 'revenue' | 'inventory' | 'operations' | 'demand';
  title: string;
  description: string;
  suggestedQuery: string;
  evidenceSnippet: string;
  detectedAt: string;
  impact?: SignalImpact;
}

export interface RARDecomposition {
  inventoryLeak: number;
  conversionLeak: number;
  opsLeak: number;
  channelMixLeak: number;
  explainedBySeason: number;
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
  revenueAtRiskTotal: number;
  rarDecomposition: RARDecomposition;
  aiPrediction?: string;
}

export interface RevenueSeriesPoint {
  date: string;
  revenue: number;
  traffic: number;
  orders: number;
}

export interface IDashboardState {
  organizationId: string;
  sk: string; // "STATE"
  revenueAtRiskSeries: RevenueSeriesPoint[];
  liveSignals: LiveSignal[];
  kpiSummary: KpiSummary;
  lastComputedAt: string;
  resolvedSignalIds: string[];
}

export interface Department {
  id: string;
  name: string;
  email: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface SignalThresholds {
  revenueDropWoW: number;
  revenueDropDoD: number;
  trafficUpCvrDown: { trafficDelta: number; revenueDelta: number };
  aovCollapse: number;
  topSkuRevenueDrop: number;
  oosRateCritical: number;
  oosRateWarning: number;
  returnRateWarning: number;
  returnRateCritical: number;
  slaAdherenceWarning: number;
  slaAdherenceCritical: number;
  cancelRateWarning: number;
  cancelRateCritical: number;
  rtoRateWarning: number;
  rtoRateCritical: number;
  demandSpikeStdDevMultiplier: number;
  skuSpikeStdDevMultiplier: number;
  skuSpikeMinMultiplier: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  revenueDropWoW: 15,
  revenueDropDoD: 10,
  trafficUpCvrDown: { trafficDelta: 10, revenueDelta: -10 },
  aovCollapse: 15,
  topSkuRevenueDrop: 20,
  oosRateCritical: 10,
  oosRateWarning: 5,
  returnRateWarning: 5,
  returnRateCritical: 15,
  slaAdherenceWarning: 90,
  slaAdherenceCritical: 80,
  cancelRateWarning: 3,
  cancelRateCritical: 10,
  rtoRateWarning: 8,
  rtoRateCritical: 15,
  demandSpikeStdDevMultiplier: 2.0,
  skuSpikeStdDevMultiplier: 2.5,
  skuSpikeMinMultiplier: 2.0,
};

export interface IOrgSettings {
  organizationId: string;
  sk: string; // "SETTINGS"
  departments: Department[];
  smtp: SmtpConfig | null;
  thresholds: SignalThresholds;
}

// ----- Analysis -----
export interface AnalysisStep {
  stage: number;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  detail?: string;
}

export interface AnalysisResultData {
  rootCauses: Array<{
    id: string;
    title: string;
    description: string;
    contribution: number;
    confidence: number;
    monitorType: string;
    contributingFactors: string[];
    evidence: Record<string, unknown>;
  }>;
  businessImpact: {
    lostRevenue: number;
    lostRevenueFormatted: string;
    conversionDrop: number;
    oosSkus: number;
    slaBreaches: number;
    stockAtHQ: number;
    stockAtTarget: number;
  };
  actions: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    effort: string;
    expectedImpact: string;
    owner: string;
    type: string;
  }>;
  geoOpportunity: {
    origin: string;
    originLabel: string;
    destination: string;
    destinationLabel: string;
    narrative: string;
  } | null;
  charts: {
    revenueVsTraffic: Array<{ date: string; revenue: number; traffic: number }>;
    externalFactors: Array<{ time: string; [key: string]: unknown }>;
  };
  memoMarkdown: string;
}

export interface IAnalysisSession {
  organizationId: string;
  sessionId: string;
  query: string;
  signalId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: AnalysisStep[];
  result?: AnalysisResultData;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  messages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export interface IAnomaly {
  organizationId: string;
  anomalyId: string;
  kpiName: string;
  detectedAt: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  dimensions: Record<string, string>;
  status: 'detected' | 'analyzing' | 'resolved' | 'dismissed';
  resolvedAt?: string;
}

export interface IHypothesis {
  anomalyId: string;
  organizationId: string;
  description: string;
  expectedEvidence: string[];
  testCriteria: Array<{ dataSource: string; query: string; expectedResult: string }>;
  status: 'pending' | 'testing' | 'confirmed' | 'rejected';
  confidenceScore?: number;
  generatedAt: string;
  testedAt?: string;
}

export interface IRootCause {
  anomalyId: string;
  hypothesisId: string;
  organizationId: string;
  description: string;
  confidenceScore: number;
  businessImpact: 'high' | 'medium' | 'low';
  contributingFactors: string[];
  evidenceChain: Array<{ dataSource: string; query: string; result: unknown }>;
  identifiedAt: string;
}

export interface IAction {
  rootCauseId: string;
  anomalyId: string;
  organizationId: string;
  actionType: 'replenish_inventory' | 'escalate_ops_issue' | 'investigate_sku_listing';
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  suggestedOwner: string;
  assignedOwner?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  context: Record<string, unknown>;
  createdAt: string;
  dueDate?: string;
  completedAt?: string;
}
