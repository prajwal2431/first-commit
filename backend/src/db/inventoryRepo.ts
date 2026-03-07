import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IInventoryRecord } from '../models/types';

const GSI = 'sourceId-index';
const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function buildInventorySk(sku: string, location: string, date: string): string {
  return `${sku}#${location}#${date}`;
}

export async function listInventoryByOrg(organizationId: string, maxItems = 10000): Promise<IInventoryRecord[]> {
  const items: IInventoryRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.inventory,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as IInventoryRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return items;
}

export async function deleteInventoryBySourceId(sourceId: string): Promise<void> {
  const keys: { organizationId: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.inventory,
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
          [TableNames.inventory]: chunk.map((k) => ({ DeleteRequest: { Key: k } })),
        },
      })
    );
  }
}

export async function batchPutInventory(
  organizationId: string,
  sourceId: string,
  rows: Array<{ sku: string; location: string; date: Date | string; available_qty: number }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const date = dateStr(r.date);
      return {
        organizationId,
        sk: buildInventorySk(r.sku, r.location, date),
        sourceId,
        sku: r.sku,
        location: r.location,
        date,
        available_qty: r.available_qty,
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.inventory]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}

export async function countInventoryByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.inventory,
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
