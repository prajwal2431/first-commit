import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import dataSourcesRouter from './routes/dataSources';
import dashboardRouter from './routes/dashboard';
import analysisRouter from './routes/analysis';
import chatRouter from './routes/chat';
import signalsRouter from './routes/signals';
import settingsRouter from './routes/settings';
import notificationsRouter from './routes/notifications';
import debugDbRouter from './routes/debugDb';
import { requireAuth } from './middleware/auth';
import { startSyncScheduler } from './services/sheets';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(cors());
app.use(morgan('combined'));

app.use('/', healthRouter);
app.use('/api/auth', authRouter);

app.use('/api/data-sources', requireAuth, dataSourcesRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/analysis', requireAuth, analysisRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/signals', requireAuth, signalsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);

app.use('/api/debug/db', debugDbRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startSyncScheduler();
});
