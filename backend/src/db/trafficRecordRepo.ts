import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { ITrafficRecord } from '../models/types';

const GSI = 'sourceId-index';
const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function buildTrafficSk(date: string, sourceId: string): string {
  return `${date}#${sourceId}`;
}

export async function listTrafficByOrg(organizationId: string, maxItems = 5000): Promise<ITrafficRecord[]> {
  const items: ITrafficRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.trafficRecords,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as ITrafficRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return items;
}

export async function deleteTrafficBySourceId(sourceId: string): Promise<void> {
  const keys: { organizationId: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.trafficRecords,
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
          [TableNames.trafficRecords]: chunk.map((k) => ({ DeleteRequest: { Key: k } })),
        },
      })
    );
  }
}

export async function batchPutTraffic(
  organizationId: string,
  sourceId: string,
  rows: Array<{
    date: Date | string;
    channel?: string;
    sku?: string;
    sessions?: number;
    impressions?: number;
    clicks?: number;
    spend?: number;
  }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const date = dateStr(r.date);
      return {
        organizationId,
        sk: buildTrafficSk(date, sourceId),
        sourceId,
        date,
        channel: r.channel ?? '',
        sku: r.sku ?? '',
        sessions: r.sessions ?? 0,
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        spend: r.spend ?? 0,
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.trafficRecords]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}

export async function countTrafficByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.trafficRecords,
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
