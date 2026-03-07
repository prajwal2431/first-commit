import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { dynamoClient, TableNames } from './dynamo';

/**
 * Optional: verify DynamoDB is reachable by describing one table.
 * Not required for startup; the app can run without this.
 */
export async function checkDynamoReady(): Promise<boolean> {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: TableNames.dashboardStates })
    );
    return true;
  } catch {
    return false;
  }
}

/** No-op for compatibility; DynamoDB has no connection to close. */
export async function disconnectDb(): Promise<void> {
  // DynamoDB client does not require disconnect
}
