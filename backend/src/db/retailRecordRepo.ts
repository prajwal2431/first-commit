import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IRetailRecord } from '../models/types';

const GSI = 'sourceId-date-index';
const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

export function buildSk(date: string, sourceId: string, sku: string): string {
  return `${date}#${sourceId}#${sku}`;
}

/** Query by organizationId; returns all items (paginates internally). */
export async function listRetailByOrg(organizationId: string, maxItems = 15000): Promise<IRetailRecord[]> {
  const items: IRetailRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.retailRecords,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as IRetailRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return items;
}

/** Query by sourceId (GSI), then delete by batch. */
export async function deleteBySourceId(sourceId: string): Promise<void> {
  const keys: { organizationId: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.retailRecords,
        IndexName: GSI,
        KeyConditionExpression: 'sourceId = :sid',
        ExpressionAttributeValues: { ':sid': sourceId },
        ExclusiveStartKey: lastKey,
        ProjectionExpression: 'organizationId, sk',
      })
    );
    for (const item of res.Items ?? []) {
      if (item.organizationId && item.sk) keys.push({ organizationId: item.organizationId, sk: item.sk });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  for (let i = 0; i < keys.length; i += MAX_BATCH) {
    const chunk = keys.slice(i, i + MAX_BATCH);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.retailRecords]: chunk.map((k) => ({
            DeleteRequest: { Key: k },
          })),
        },
      })
    );
  }
}

export async function batchPutRetail(organizationId: string, sourceId: string, rows: Array<{
  date: Date | string;
  sku: string;
  revenue: number;
  units: number;
  traffic: number;
  inventory: number;
  returns: number;
}>): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const date = dateStr(r.date);
      const sk = buildSk(date, sourceId, r.sku);
      return {
        organizationId,
        sk,
        sourceId,
        date,
        sku: r.sku,
        revenue: r.revenue ?? 0,
        units: r.units ?? 0,
        traffic: r.traffic ?? 0,
        inventory: r.inventory ?? 0,
        returns: r.returns ?? 0,
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.retailRecords]: items.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      })
    );
  }
  return rows.length;
}

export async function countRetailByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.retailRecords,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      })
    );
    total += res.Count ?? 0;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return total;
}
