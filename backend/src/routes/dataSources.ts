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

// GET /api/data-sources — list all data sources
router.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await DataSource.find()
      .sort({ uploadedAt: -1 })
      .lean();
    res.json(list);
  } catch (err) {
    console.error('List data sources error:', err);
    res.status(500).json({ message: 'Failed to list data sources' });
  }
});

// GET /api/data-sources/:id/records — preview stored records for a data source
router.get('/:id/records', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid data source ID' });
    }
    const source = await DataSource.findById(id).lean();
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

// POST /api/data-sources/upload — upload Excel or CSV file
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file?.path) {
    return res.status(400).json({
      message: 'No file uploaded. Use field name "file" and .xlsx or .csv only.',
    });
  }

  const fileName = req.file.originalname || req.file.filename;
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.csv') {
    return handleCsvUpload(req.file.path, fileName, res);
  }
  return handleExcelUpload(req.file.path, fileName, res);
});

export default router;
