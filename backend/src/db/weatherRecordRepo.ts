import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IWeatherRecord } from '../models/types';

const MAX_BATCH = 25;

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function buildWeatherSk(date: string, region: string): string {
  return `${date}#${region}`;
}

export async function listWeatherByOrg(organizationId: string, maxItems = 2000): Promise<IWeatherRecord[]> {
  const items: IWeatherRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  while (items.length < maxItems) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.weatherRecords,
        KeyConditionExpression: 'organizationId = :org',
        ExpressionAttributeValues: { ':org': organizationId },
        ExclusiveStartKey: lastKey,
        Limit: 500,
      })
    );
    items.push(...((res.Items ?? []) as IWeatherRecord[]));
    lastKey = res.LastEvaluatedKey;
    if (!lastKey) break;
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return items;
}

export async function batchPutWeather(
  organizationId: string,
  rows: Array<{
    date: Date | string;
    region: string;
    temp_min?: number;
    temp_max?: number;
    rainfall_mm?: number;
    humidity?: number;
  }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => {
      const date = dateStr(r.date);
      return {
        organizationId,
        sk: buildWeatherSk(date, r.region),
        date,
        region: r.region,
        temp_min: r.temp_min ?? 0,
        temp_max: r.temp_max ?? 0,
        rainfall_mm: r.rainfall_mm ?? 0,
        humidity: r.humidity ?? 0,
      };
    });
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.weatherRecords]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}

export async function countWeatherByOrg(organizationId: string): Promise<number> {
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TableNames.weatherRecords,
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
