import { Response, Request } from 'express';
import fs from 'fs';
import path from 'path';
import { DataSource } from '../models/DataSource';
import { ingestRawCsv, ingestRawExcel } from '../services/ingestRaw';
import { parseRetailCsv } from '../services/parseRetailCsv';
import { parseExcelFile } from '../services/parseExcel';
import { parseTrafficCsv } from '../services/parseTrafficCsv';
import { parseFulfilmentCsv } from '../services/parseFulfilmentCsv';
import { parseWeatherCsv } from '../services/parseWeatherCsv';
import { computeAllMonitors } from '../services/monitors/computeAll';

type DataType = 'orders' | 'inventory' | 'retail' | 'traffic' | 'fulfilment' | 'weather' | 'auto';

function getOrgId(req: Request): string {
  return req.user?.tenantId ?? 'default';
}

function getUserId(req: Request): string {
  return req.user?.userId ?? 'default';
}

function cleanupFile(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

export async function handleExcelUpload(
  req: Request,
  filePath: string,
  fileName: string,
  res: Response
): Promise<void> {
  const orgId = getOrgId(req);
  const userId = getUserId(req);

  let doc;
  try {
    doc = await DataSource.create({
      userId,
      organizationId: orgId,
      fileName,
      fileType: 'excel',
      status: 'processing',
    });

    await ingestRawExcel(filePath, String(doc._id), orgId);

    const structuredResult = await parseExcelFile(filePath, String(doc._id), orgId);

    doc.status = 'completed';
    doc.recordCount = structuredResult.recordCount;
    await doc.save();
    cleanupFile(filePath);

    triggerMonitorRecompute(orgId);

    res.status(201).json({
      dataSourceId: doc._id,
      status: doc.status,
      recordCount: doc.recordCount,
      dataType: structuredResult.dataType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    if (doc) {
      doc.status = 'failed';
      doc.errorMessage = message;
      await doc.save().catch(() => { });
    }
    cleanupFile(filePath);
    res.status(400).json({ message });
  }
}

export async function handleCsvUpload(
  req: Request,
  filePath: string,
  fileName: string,
  dataType: DataType,
  res: Response
): Promise<void> {
  const orgId = getOrgId(req);
  const userId = getUserId(req);

  let doc;
  try {
    doc = await DataSource.create({
      userId,
      organizationId: orgId,
      fileName,
      fileType: 'csv',
      status: 'processing',
    });

    await ingestRawCsv(filePath, String(doc._id), orgId);

    let recordCount = 0;
    let detectedType: string = dataType;

    switch (dataType) {
      case 'traffic': {
        const r = await parseTrafficCsv(filePath, String(doc._id), orgId);
        recordCount = r.inserted;
        break;
      }
      case 'fulfilment': {
        const r = await parseFulfilmentCsv(filePath, String(doc._id), orgId);
        recordCount = r.inserted;
        break;
      }
      case 'weather': {
        const r = await parseWeatherCsv(filePath, String(doc._id), orgId);
        recordCount = r.inserted;
        break;
      }
      case 'orders':
      case 'inventory': {
        const r = await parseExcelFile(filePath, String(doc._id), orgId);
        recordCount = r.recordCount;
        detectedType = r.dataType;
        break;
      }
      case 'retail':
      case 'auto':
      default: {
        try {
          const r = await parseRetailCsv(filePath, String(doc._id), orgId);
          recordCount = r.inserted;
          detectedType = 'retail';
        } catch {
          const r = await parseExcelFile(filePath, String(doc._id), orgId);
          recordCount = r.recordCount;
          detectedType = r.dataType;
        }
        break;
      }
    }

    doc.status = 'completed';
    doc.recordCount = recordCount;
    await doc.save();
    cleanupFile(filePath);

    triggerMonitorRecompute(orgId);

    res.status(201).json({
      dataSourceId: doc._id,
      status: doc.status,
      recordCount,
      dataType: detectedType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    if (doc) {
      doc.status = 'failed';
      doc.errorMessage = message;
      await doc.save().catch(() => { });
    }
    cleanupFile(filePath);
    res.status(400).json({ message });
  }
}

function triggerMonitorRecompute(orgId: string): void {
  computeAllMonitors(orgId).catch((err) => {
    console.error('Background monitor recompute failed:', err);
  });
}
