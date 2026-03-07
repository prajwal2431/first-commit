import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IDashboardState } from '../models/types';

const SK = 'STATE';

export async function getDashboardState(organizationId: string): Promise<IDashboardState | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.dashboardStates,
      Key: { organizationId, sk: SK },
    })
  );
  const out = res as { Item?: IDashboardState };
  return out.Item ?? null;
}

export async function putDashboardState(state: IDashboardState): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TableNames.dashboardStates,
      Item: { ...state, sk: SK },
    })
  );
}

export async function updateResolvedSignalIds(organizationId: string, resolvedSignalIds: string[]): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TableNames.dashboardStates,
      Key: { organizationId, sk: SK },
      UpdateExpression: 'SET resolvedSignalIds = :ids',
      ExpressionAttributeValues: { ':ids': resolvedSignalIds },
    })
  );
}
