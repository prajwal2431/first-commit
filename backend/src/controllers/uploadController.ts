import { Response, Request } from 'express';
import fs from 'fs';
import { createDataSource, updateDataSource } from '../db/dataSourceRepo';
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
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
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
    doc = await createDataSource({
      userId,
      organizationId: orgId,
      fileName,
      fileType: 'excel',
      status: 'processing',
    });

    await ingestRawExcel(filePath, doc.sourceId, orgId);

    const structuredResult = await parseExcelFile(filePath, doc.sourceId, orgId);

    await updateDataSource(orgId, doc.sourceId, {
      status: 'completed',
      recordCount: structuredResult.recordCount,
    });
    cleanupFile(filePath);

    computeAllMonitors(orgId).catch((err) => {
      console.error('Background monitor recompute failed:', err);
    });

    res.status(201).json({
      dataSourceId: doc.sourceId,
      status: 'completed',
      recordCount: structuredResult.recordCount,
      dataType: structuredResult.dataType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    if (doc) {
      await updateDataSource(orgId, doc.sourceId, { status: 'failed', errorMessage: message }).catch(() => {});
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
    doc = await createDataSource({
      userId,
      organizationId: orgId,
      fileName,
      fileType: 'csv',
      status: 'processing',
    });

    await ingestRawCsv(filePath, doc.sourceId, orgId);

    let recordCount = 0;
    let detectedType: string = dataType;

    switch (dataType) {
      case 'traffic': {
        const r = await parseTrafficCsv(filePath, doc.sourceId, orgId);
        recordCount = r.inserted;
        break;
      }
      case 'fulfilment': {
        const r = await parseFulfilmentCsv(filePath, doc.sourceId, orgId);
        recordCount = r.inserted;
        break;
      }
      case 'weather': {
        const r = await parseWeatherCsv(filePath, doc.sourceId, orgId);
        recordCount = r.inserted;
        break;
      }
      case 'orders':
      case 'inventory': {
        const r = await parseExcelFile(filePath, doc.sourceId, orgId);
        recordCount = r.recordCount;
        detectedType = r.dataType;
        break;
      }
      case 'retail':
      case 'auto':
      default: {
        try {
          const r = await parseRetailCsv(filePath, doc.sourceId, orgId);
          recordCount = r.inserted;
          detectedType = 'retail';
        } catch {
          const r = await parseExcelFile(filePath, doc.sourceId, orgId);
          recordCount = r.recordCount;
          detectedType = r.dataType;
        }
        break;
      }
    }

    await updateDataSource(orgId, doc.sourceId, { status: 'completed', recordCount });
    cleanupFile(filePath);

    computeAllMonitors(orgId).catch((err) => {
      console.error('Background monitor recompute failed:', err);
    });

    res.status(201).json({
      dataSourceId: doc.sourceId,
      status: 'completed',
      recordCount,
      dataType: detectedType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    if (doc) {
      await updateDataSource(orgId, doc.sourceId, { status: 'failed', errorMessage: message }).catch(() => {});
    }
    cleanupFile(filePath);
    res.status(400).json({ message });
  }
}
