import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { DataSource } from '../models/DataSource';
import { OrderRecord } from '../models/OrderRecord';
import { InventoryRecord } from '../models/InventoryRecord';
import { RetailRecord } from '../models/RetailRecord';
import { RawIngestionRecord } from '../models/RawIngestionRecord';

const router = Router();

/**
 * GET /api/debug/db — verify MongoDB connection and show collection counts.
 * Use this to confirm which database the app uses and that data is stored.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const conn = mongoose.connection;
    const dbName = conn.db?.databaseName ?? conn.name ?? 'unknown';

    const [dataSources, orders, inventory, retail, raw] = await Promise.all([
      DataSource.countDocuments(),
      OrderRecord.countDocuments(),
      InventoryRecord.countDocuments(),
      RetailRecord.countDocuments(),
      RawIngestionRecord.countDocuments(),
    ]);

    res.json({
      connected: conn.readyState === 1,
      database: dbName,
      message: 'Open this database in MongoDB Compass or mongosh to see collections.',
      collections: {
        data_sources: dataSources,
        orders,
        inventory,
        retail_records: retail,
        raw_ingestion_records: raw,
      },
    });
  } catch (err) {
    console.error('Debug db error:', err);
    res.status(500).json({ message: 'Failed to read database info' });
  }
});

export default router;
