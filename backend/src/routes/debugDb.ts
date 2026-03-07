import { Router, Request, Response } from 'express';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';

const router = Router();

/**
 * GET /api/debug/db — verify DynamoDB and show approximate item counts per table.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tableNames = [
      TableNames.dataSources,
      TableNames.orders,
      TableNames.inventory,
      TableNames.retailRecords,
      TableNames.rawIngestionRecords,
    ];

    const counts: Record<string, number> = {};
    for (const name of tableNames) {
      let total = 0;
      let lastKey: Record<string, unknown> | undefined;
      do {
        const result = await docClient.send(
          new ScanCommand({
            TableName: name,
            Select: 'COUNT',
            ExclusiveStartKey: lastKey,
          })
        );
        total += result.Count ?? 0;
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
      counts[name] = total;
    }

    res.json({
      connected: true,
      database: 'DynamoDB',
      message: 'Backend is using DynamoDB. Tables and approximate item counts below.',
      collections: {
        data_sources: counts[TableNames.dataSources] ?? 0,
        orders: counts[TableNames.orders] ?? 0,
        inventory: counts[TableNames.inventory] ?? 0,
        retail_records: counts[TableNames.retailRecords] ?? 0,
        raw_ingestion_records: counts[TableNames.rawIngestionRecords] ?? 0,
      },
    });
  } catch (err) {
    console.error('Debug db error:', err);
    res.status(500).json({ message: 'Failed to read database info', error: String(err) });
  }
});

export default router;
