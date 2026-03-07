import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IFulfilmentRecord } from '../models/types';

const GSI = 'sourceId-index';
const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function buildFulfilmentSk(dispatch_date: string, order_id: string): string {
  return `${dispatch_date}#${order_id}`;
}

export async function listFulfilmentByOrg(organizationId: string, maxItems = 5000): Promise<IFulfilmentRecord[]> {
  const items: IFulfilmentRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.fulfilmentRecords,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as IFulfilmentRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (b.dispatch_date ?? '').localeCompare(a.dispatch_date ?? ''));
  return items;
}

export async function deleteFulfilmentBySourceId(sourceId: string): Promise<void> {
  const keys: { organizationId: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.fulfilmentRecords,
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
          [TableNames.fulfilmentRecords]: chunk.map((k) => ({ DeleteRequest: { Key: k } })),
        },
      })
    );
  }
}

export async function batchPutFulfilment(
  organizationId: string,
  sourceId: string,
  rows: Array<{
    order_id: string;
    sku?: string;
    dispatch_date: Date | string;
    delivery_date?: Date | string;
    expected_delivery_date?: Date | string;
    delay_days: number;
    carrier: string;
    warehouse: string;
    region: string;
    status: 'dispatched' | 'delivered' | 'returned' | 'cancelled' | 'rto';
  }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const dispatch_date = dateStr(r.dispatch_date);
      return {
        organizationId,
        sk: buildFulfilmentSk(dispatch_date, r.order_id),
        sourceId,
        order_id: r.order_id,
        sku: r.sku ?? '',
        dispatch_date,
        delivery_date: r.delivery_date ? dateStr(r.delivery_date) : undefined,
        expected_delivery_date: r.expected_delivery_date ? dateStr(r.expected_delivery_date) : undefined,
        delay_days: r.delay_days ?? 0,
        carrier: r.carrier ?? '',
        warehouse: r.warehouse ?? '',
        region: r.region ?? '',
        status: r.status ?? 'dispatched',
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.fulfilmentRecords]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}

export async function countFulfilmentByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.fulfilmentRecords,
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
