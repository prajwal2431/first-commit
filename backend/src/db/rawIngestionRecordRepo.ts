import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IRawIngestionRecord } from '../models/types';

const MAX_BATCH = 25;

export async function listRawBySourceId(sourceId: string, limit: number): Promise<IRawIngestionRecord[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: TableNames.rawIngestionRecords,
      KeyConditionExpression: 'sourceId = :sid',
      ExpressionAttributeValues: { ':sid': sourceId },
      Limit: limit,
      ScanIndexForward: true,
    })
  );
  return (res.Items ?? []) as IRawIngestionRecord[];
}

export async function deleteRawBySourceId(sourceId: string): Promise<void> {
  const items = await listRawBySourceId(sourceId, 10000);
  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const chunk = items.slice(i, i + MAX_BATCH);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.rawIngestionRecords]: chunk.map((r) => ({
            DeleteRequest: { Key: { sourceId: r.sourceId, rowIndex: r.rowIndex } },
          })),
        },
      })
    );
  }
}

export async function batchPutRaw(
  sourceId: string,
  rows: Array<{ rowIndex: number; data: Record<string, unknown> }>
): Promise<number> {
  for (let i = 0; i < rows.length; i += MAX_BATCH) {
    const chunk = rows.slice(i, i + MAX_BATCH);
    const items = chunk.map((r) => ({
      sourceId,
      rowIndex: r.rowIndex,
      data: r.data,
    }));
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TableNames.rawIngestionRecords]: items.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    );
  }
  return rows.length;
}
