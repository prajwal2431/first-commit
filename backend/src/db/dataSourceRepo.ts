import {
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IDataSource } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export function createSourceId(): string {
  return uuidv4();
}

export async function listDataSourcesByOrg(organizationId: string): Promise<IDataSource[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: TableNames.dataSources,
      KeyConditionExpression: 'organizationId = :org',
      ExpressionAttributeValues: { ':org': organizationId },
    })
  );
  const items = (res.Items ?? []) as IDataSource[];
  items.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
  return items;
}

export async function getDataSource(organizationId: string, sourceId: string): Promise<IDataSource | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.dataSources,
      Key: { organizationId, sourceId },
    })
  );
  const out = res as { Item?: IDataSource };
  return out.Item ?? null;
}

export async function createDataSource(input: Omit<IDataSource, 'sourceId' | 'uploadedAt'>): Promise<IDataSource> {
  const sourceId = createSourceId();
  const uploadedAt = new Date().toISOString();
  const item: IDataSource = {
    ...input,
    sourceId,
    uploadedAt,
  };
  await docClient.send(
    new PutCommand({
      TableName: TableNames.dataSources,
      Item: item,
    })
  );
  return item;
}

export async function updateDataSource(
  organizationId: string,
  sourceId: string,
  updates: Partial<Pick<IDataSource, 'status' | 'recordCount' | 'lastSyncAt' | 'errorMessage'>>
): Promise<void> {
  const expr: string[] = [];
  const values: Record<string, unknown> = {};
  if (updates.status !== undefined) {
    expr.push('#st = :st');
    values[':st'] = updates.status;
  }
  if (updates.recordCount !== undefined) {
    expr.push('recordCount = :rc');
    values[':rc'] = updates.recordCount;
  }
  if (updates.lastSyncAt !== undefined) {
    expr.push('lastSyncAt = :ls');
    values[':ls'] = updates.lastSyncAt;
  }
  if (updates.errorMessage !== undefined) {
    expr.push('errorMessage = :em');
    values[':em'] = updates.errorMessage;
  }
  if (expr.length === 0) return;
  await docClient.send(
    new UpdateCommand({
      TableName: TableNames.dataSources,
      Key: { organizationId, sourceId },
      UpdateExpression: 'SET ' + expr.join(', '),
      ExpressionAttributeValues: values,
      ...(updates.status !== undefined ? { ExpressionAttributeNames: { '#st': 'status' } } : {}),
    })
  );
}

export async function deleteDataSource(organizationId: string, sourceId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TableNames.dataSources,
      Key: { organizationId, sourceId },
    })
  );
}

/** List all data sources that have a sheetsUrl and are not disconnected (for sync scheduler). */
export async function listSheetSources(): Promise<IDataSource[]> {
  const items: IDataSource[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new ScanCommand({
        TableName: TableNames.dataSources,
        FilterExpression: 'attribute_exists(sheetsUrl) AND sheetsUrl <> :empty AND (#st <> :disconnected)',
        ExpressionAttributeValues: { ':empty': '', ':disconnected': 'disconnected' },
        ExpressionAttributeNames: { '#st': 'status' },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...((res.Items ?? []) as IDataSource[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
