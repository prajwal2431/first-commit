import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { DataSource } from '../models/DataSource';
import { RawIngestionRecord } from '../models/RawIngestionRecord';
import { handleExcelUpload, handleCsvUpload } from '../controllers/uploadController';

const PREVIEW_LIMIT = 100;

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
    const list = await DataSource.find({ organizationId: orgId })
      .sort({ uploadedAt: -1 })
      .lean();
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
    const { name, label, type, domain, mode } = req.body;

    // Create new DataSource model instance
    const newSource = await DataSource.create({
      userId,
      organizationId: orgId,
      fileName: name || label || 'Integration',
      fileType: type || 'integration',
      label: label || name,
      domain: domain || 'Data Ingestion',
      mode: mode || 'API',
      status: 'connected', // Immediately marked as connected for now
    });

    res.status(201).json(newSource);
  } catch (err) {
    console.error('Create data source error:', err);
    res.status(500).json({ message: 'Failed to create data source' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const orgId = req.user?.tenantId ?? 'default';

    // Delete source
    const result = await DataSource.deleteOne({ _id: id, organizationId: orgId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Data source not found' });
    }

    // Attempt to cleanup related ingestion records if any
    await RawIngestionRecord.deleteMany({ sourceId: String(id) });

    res.status(200).json({ message: 'Data source deleted successfully' });
  } catch (err) {
    console.error('Delete data source error:', err);
    res.status(500).json({ message: 'Failed to delete data source' });
  }
});

router.get('/:id/records', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const source = await DataSource.findOne({ _id: id, organizationId: orgId }).lean();
    if (!source) {
      return res.status(404).json({ message: 'Data source not found' });
    }

    const sourceIdStr = String(id);
    const rawDocs = await RawIngestionRecord.find({ sourceId: sourceIdStr })
      .sort({ rowIndex: 1 })
      .limit(PREVIEW_LIMIT)
      .lean();
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
    return handleCsvUpload(req, req.file.path, fileName, dataType as any, res);
  }
  return handleExcelUpload(req, req.file.path, fileName, res);
});

export default router;
