import { Router, Request, Response } from 'express';
import { checkDynamoReady } from '../config/db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const dbReady = await checkDynamoReady();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: { status: dbReady ? 'connected' : 'unavailable' },
  });
});

export default router;
