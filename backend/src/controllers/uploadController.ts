import { Response } from 'express';
import fs from 'fs';
import { DataSource } from '../models/DataSource';
import { ingestRawCsv } from '../services/ingestRaw';
import { ingestRawExcel } from '../services/ingestRaw';

const DEFAULT_ORG = 'default';
const DEFAULT_USER = 'default';

/**
 * Handle Excel upload: store every row as-is with file headers as keys (no strict schema).
 */
export async function handleExcelUpload(
  filePath: string,
  fileName: string,
  res: Response
): Promise<void> {
  const doc = await DataSource.create({
    userId: DEFAULT_USER,
    organizationId: DEFAULT_ORG,
    fileName,
    fileType: 'excel',
    status: 'processing',
  });

  try {
    const { inserted } = await ingestRawExcel(filePath, String(doc._id), DEFAULT_ORG);
    doc.status = 'completed';
    doc.recordCount = inserted;
    await doc.save();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    res.status(201).json({
      dataSourceId: doc._id,
      status: doc.status,
      recordCount: doc.recordCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    doc.status = 'failed';
    doc.errorMessage = message;
    await doc.save();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    res.status(400).json({ message });
  }
}

/**
 * Handle CSV upload: store every row as-is with file headers as keys (no strict schema).
 */
export async function handleCsvUpload(
  filePath: string,
  fileName: string,
  res: Response
): Promise<void> {
  const doc = await DataSource.create({
    userId: DEFAULT_USER,
    organizationId: DEFAULT_ORG,
    fileName,
    fileType: 'csv',
    status: 'processing',
  });

  try {
    const { inserted } = await ingestRawCsv(filePath, String(doc._id), DEFAULT_ORG);
    doc.status = 'completed';
    doc.recordCount = inserted;
    await doc.save();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    res.status(201).json({
      dataSourceId: doc._id,
      status: doc.status,
      recordCount: doc.recordCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    doc.status = 'failed';
    doc.errorMessage = message;
    await doc.save();
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    res.status(400).json({ message });
  }
}
