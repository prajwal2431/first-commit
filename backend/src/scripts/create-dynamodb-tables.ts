/**
 * Create all DynamoDB tables and GSIs for the application.
 * Run: npm run create-tables (from backend directory)
 * Requires: AWS_REGION (and optionally DYNAMODB_ENDPOINT for local).
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  BillingMode,
  KeyType,
  KeySchemaElement,
  AttributeDefinition,
  ProjectionType,
  GlobalSecondaryIndex,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';
import { TableNames } from '../config/dynamo';

const region = process.env.AWS_REGION ?? 'us-east-1';
const endpoint = process.env.DYNAMODB_ENDPOINT;
const client = new DynamoDBClient(endpoint ? { region, endpoint } : { region });

const tableNames = {
  tenants: TableNames.tenants,
  users: TableNames.users,
  dataSources: TableNames.dataSources,
  retailRecords: TableNames.retailRecords,
  orders: TableNames.orders,
  inventory: TableNames.inventory,
  fulfilmentRecords: TableNames.fulfilmentRecords,
  trafficRecords: TableNames.trafficRecords,
  weatherRecords: TableNames.weatherRecords,
  rawIngestionRecords: TableNames.rawIngestionRecords,
  dashboardStates: TableNames.dashboardStates,
  orgSettings: TableNames.orgSettings,
  analysisSessions: TableNames.analysisSessions,
  anomalies: TableNames.anomalies,
};

async function createTable(
  TableName: string,
  KeySchema: KeySchemaElement[],
  AttributeDefinitions: AttributeDefinition[],
  GlobalSecondaryIndexes?: GlobalSecondaryIndex[]
) {
  try {
    await client.send(
      new CreateTableCommand({
        TableName,
        KeySchema,
        AttributeDefinitions,
        GlobalSecondaryIndexes,
        BillingMode: BillingMode.PAY_PER_REQUEST,
      })
    );
    console.log(`Created table: ${TableName}`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ResourceInUseException') {
      console.log(`Table already exists: ${TableName}`);
    } else {
      throw err;
    }
  }
}

async function main() {
  await createTable(
    tableNames.tenants,
    [{ AttributeName: 'tenantId', KeyType: KeyType.HASH }],
    [{ AttributeName: 'tenantId', AttributeType: ScalarAttributeType.S }]
  );

  await createTable(
    tableNames.users,
    [{ AttributeName: 'userId', KeyType: KeyType.HASH }],
    [
      { AttributeName: 'userId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'email', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'email-index',
        KeySchema: [{ AttributeName: 'email', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.dataSources,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sourceId', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
    ]
  );

  await createTable(
    tableNames.retailRecords,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'date', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'sourceId-date-index',
        KeySchema: [
          { AttributeName: 'sourceId', KeyType: KeyType.HASH },
          { AttributeName: 'date', KeyType: KeyType.RANGE },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.orders,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'date', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'sourceId-date-index',
        KeySchema: [
          { AttributeName: 'sourceId', KeyType: KeyType.HASH },
          { AttributeName: 'date', KeyType: KeyType.RANGE },
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.inventory,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'sourceId-index',
        KeySchema: [{ AttributeName: 'sourceId', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.fulfilmentRecords,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'sourceId-index',
        KeySchema: [{ AttributeName: 'sourceId', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.trafficRecords,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
    ],
    [
      {
        IndexName: 'sourceId-index',
        KeySchema: [{ AttributeName: 'sourceId', KeyType: KeyType.HASH }],
        Projection: { ProjectionType: ProjectionType.ALL },
      },
    ]
  );

  await createTable(
    tableNames.weatherRecords,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
    ]
  );

  await createTable(
    tableNames.rawIngestionRecords,
    [
      { AttributeName: 'sourceId', KeyType: KeyType.HASH },
      { AttributeName: 'rowIndex', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'sourceId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'rowIndex', AttributeType: ScalarAttributeType.N },
    ]
  );

  await createTable(
    tableNames.dashboardStates,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
    ]
  );

  await createTable(
    tableNames.orgSettings,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
    ]
  );

  await createTable(
    tableNames.analysisSessions,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'sessionId', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sessionId', AttributeType: ScalarAttributeType.S },
    ]
  );

  await createTable(
    tableNames.anomalies,
    [
      { AttributeName: 'organizationId', KeyType: KeyType.HASH },
      { AttributeName: 'anomalyId', KeyType: KeyType.RANGE },
    ],
    [
      { AttributeName: 'organizationId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'anomalyId', AttributeType: ScalarAttributeType.S },
    ]
  );

  console.log('All tables created.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
