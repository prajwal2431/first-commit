import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
// Fallback to .env if needed
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDb } from './config/db';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import dataSourcesRouter from './routes/dataSources';
import dashboardRouter from './routes/dashboard';
import analysisRouter from './routes/analysis';
import chatRouter from './routes/chat';
import debugDbRouter from './routes/debugDb';
import { requireAuth } from './middleware/auth';
import './models';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(cors());
app.use(morgan('combined'));

// Public routes
app.use('/', healthRouter);
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/data-sources', requireAuth, dataSourcesRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/analysis', requireAuth, analysisRouter);
app.use('/api/chat', requireAuth, chatRouter);

// Debug (unprotected for dev)
app.use('/api/debug/db', debugDbRouter);

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
