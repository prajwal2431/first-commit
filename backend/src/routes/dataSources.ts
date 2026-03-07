import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  listDataSourcesByOrg,
  getDataSource,
  createDataSource,
  deleteDataSource,
} from '../db/dataSourceRepo';
import { listRawBySourceId, deleteRawBySourceId } from '../db/rawIngestionRecordRepo';
import { deleteBySourceId } from '../db/retailRecordRepo';
import { deleteOrdersBySourceId } from '../db/orderRepo';
import { deleteInventoryBySourceId } from '../db/inventoryRepo';
import { deleteFulfilmentBySourceId } from '../db/fulfilmentRecordRepo';
import { deleteTrafficBySourceId } from '../db/trafficRecordRepo';
import { handleExcelUpload, handleCsvUpload } from '../controllers/uploadController';
import { syncSingleSheetSource } from '../services/sheets';
import { computeAllMonitors } from '../services/monitors/computeAll';

const PREVIEW_LIMIT = 100;

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}

const router = Router();
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.xlsx';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const isExcel =
      name.endsWith('.xlsx') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv =
      name.endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype === 'application/csv';
    if (isExcel || isCsv) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx or .csv files are allowed'));
    }
  },
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const list = await listDataSourcesByOrg(orgId);
    res.json(list);
  } catch (err) {
    console.error('List data sources error:', err);
    res.status(500).json({ message: 'Failed to list data sources' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const userId = req.user?.userId ?? 'default';
    const { name, label, type, domain, mode, sourceUrl, sheetsUrl } = req.body;

    const finalUrl = sheetsUrl || sourceUrl;
    const isSheets = mode === 'Sheets' && finalUrl;

    const newSource = await createDataSource({
      userId,
      organizationId: orgId,
      fileName: name || label || 'Integration',
      fileType: isSheets ? 'sheets' : (type || 'integration'),
      label: label || name,
      domain: domain || 'Data Ingestion',
      mode: mode || 'API',
      status: isSheets ? 'syncing' : 'connected',
      sheetsUrl: isSheets ? finalUrl : undefined,
      ...(typeof finalUrl === 'string' && finalUrl.trim() && { sourceUrl: finalUrl.trim() }),
    });

    res.status(201).json(newSource);

    if (isSheets) {
      syncSingleSheetSource(newSource)
        .then((result) => {
          if (result && result.inserted > 0) {
            console.log(`[data-sources] Initial sheet sync done: ${result.inserted} records (${result.dataType})`);
            return computeAllMonitors(orgId);
          }
        })
        .catch((err) => {
          console.error('[data-sources] Initial sheet sync failed:', err);
        });
    }
  } catch (err) {
    console.error('Create data source error:', err);
    res.status(500).json({ message: 'Failed to create data source' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id.trim();
    if (!isValidId(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const orgId = req.user?.tenantId ?? 'default';

    const source = await getDataSource(orgId, id);
    if (!source) {
      return res.status(404).json({ message: 'Data source not found' });
    }

    await deleteDataSource(orgId, id);
    await Promise.all([
      deleteRawBySourceId(id),
      deleteBySourceId(id),
      deleteOrdersBySourceId(id),
      deleteInventoryBySourceId(id),
      deleteFulfilmentBySourceId(id),
      deleteTrafficBySourceId(id),
    ]);

    computeAllMonitors(orgId).catch((err) => console.error('Post-delete recompute failed:', err));

    res.status(200).json({ message: 'Data source deleted successfully' });
  } catch (err) {
    console.error('Delete data source error:', err);
    res.status(500).json({ message: 'Failed to delete data source' });
  }
});

router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const id = req.params.id.trim();
    if (!isValidId(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const source = await getDataSource(orgId, id);
    if (!source) {
      return res.status(404).json({ message: 'Data source not found' });
    }
    if (!source.sheetsUrl) {
      return res.status(400).json({ message: 'This data source does not have a Google Sheets URL' });
    }

    const result = await syncSingleSheetSource(source);
    if (result && result.inserted > 0) {
      await computeAllMonitors(orgId);
    }

    res.json({
      success: true,
      inserted: result?.inserted ?? 0,
      dataType: result?.dataType ?? 'unknown',
    });
  } catch (err) {
    console.error('Manual sync error:', err);
    res.status(500).json({ message: 'Sync failed' });
  }
});

router.get('/:id/records', async (req: Request, res: Response) => {
  try {
    const id = req.params.id.trim();
    if (!isValidId(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const source = await getDataSource(orgId, id);
    if (!source) {
      return res.status(404).json({ message: 'Data source not found' });
    }

    const rawDocs = await listRawBySourceId(id, PREVIEW_LIMIT);
    const records = rawDocs.map((d) => ({ rowIndex: d.rowIndex, ...d.data }));

    res.json({
      dataSourceId: id,
      fileType: source.fileType,
      fileName: source.fileName,
      count: records.length,
      records,
    });
  } catch (err) {
    console.error('Preview records error:', err);
    res.status(500).json({ message: 'Failed to load records' });
  }
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file?.path) {
    return res.status(400).json({
      message: 'No file uploaded. Use field name "file" and .xlsx or .csv only.',
    });
  }

  const fileName = req.file.originalname || req.file.filename;
  const ext = path.extname(fileName).toLowerCase();
  const dataType = (req.body?.dataType as string) || 'auto';

  if (ext === '.csv') {
    return handleCsvUpload(req, req.file.path, fileName, dataType as 'auto' | 'retail' | 'orders' | 'inventory', res);
  }
  return handleExcelUpload(req, req.file.path, fileName, res);
});

export default router;
