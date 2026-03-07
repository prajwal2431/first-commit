import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION ?? 'us-east-1';
const endpoint = process.env.DYNAMODB_ENDPOINT; // e.g. http://localhost:8000 for Localstack

export const dynamoClient = new DynamoDBClient(
  endpoint ? { region, endpoint } : { region }
);

export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
});

export const TableNames = {
  tenants: process.env.DYNAMODB_TABLE_TENANTS ?? 'tenants',
  users: process.env.DYNAMODB_TABLE_USERS ?? 'users',
  dataSources: process.env.DYNAMODB_TABLE_DATA_SOURCES ?? 'data_sources',
  retailRecords: process.env.DYNAMODB_TABLE_RETAIL_RECORDS ?? 'retail_records',
  orders: process.env.DYNAMODB_TABLE_ORDERS ?? 'orders',
  inventory: process.env.DYNAMODB_TABLE_INVENTORY ?? 'inventory',
  fulfilmentRecords: process.env.DYNAMODB_TABLE_FULFILMENT_RECORDS ?? 'fulfilment_records',
  trafficRecords: process.env.DYNAMODB_TABLE_TRAFFIC_RECORDS ?? 'traffic_records',
  weatherRecords: process.env.DYNAMODB_TABLE_WEATHER_RECORDS ?? 'weather_records',
  rawIngestionRecords: process.env.DYNAMODB_TABLE_RAW_INGESTION_RECORDS ?? 'raw_ingestion_records',
  dashboardStates: process.env.DYNAMODB_TABLE_DASHBOARD_STATES ?? 'dashboard_states',
  orgSettings: process.env.DYNAMODB_TABLE_ORG_SETTINGS ?? 'org_settings',
  analysisSessions: process.env.DYNAMODB_TABLE_ANALYSIS_SESSIONS ?? 'analysis_sessions',
  anomalies: process.env.DYNAMODB_TABLE_ANOMALIES ?? 'anomalies',
} as const;
