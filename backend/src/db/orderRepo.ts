import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IOrderRecord } from '../models/types';

const GSI = 'sourceId-date-index';
const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function buildOrderSk(date: string, orderId: string): string {
  return `${date}#${orderId}`;
}

export async function listOrdersByOrg(organizationId: string, maxItems = 15000): Promise<IOrderRecord[]> {
  const items: IOrderRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.orders,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as IOrderRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return items;
}

export async function deleteOrdersBySourceId(sourceId: string): Promise<void> {
  const keys: { organizationId: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.orders,
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
          [TableNames.orders]: chunk.map((k) => ({ DeleteRequest: { Key: k } })),
        },
      })
    );
  }
}

export async function batchPutOrders(
  organizationId: string,
  sourceId: string,
  rows: Array<{
    date: Date | string;
    order_id: string;
    sku: string;
    quantity: number;
    revenue: number;
    region: string;
  }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const date = dateStr(r.date);
      return {
        organizationId,
        sk: buildOrderSk(date, r.order_id),
        sourceId,
        date,
        order_id: r.order_id,
        sku: r.sku,
        quantity: r.quantity,
        revenue: r.revenue,
        region: r.region ?? '',
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.orders]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}

export async function countOrdersByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.orders,
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
