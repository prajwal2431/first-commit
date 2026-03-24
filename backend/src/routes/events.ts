import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Global SSE endpoint for live UI updates (heartbeats; extend with pub/sub later).
 * EventSource cannot send Authorization headers, so this route is public; payloads should stay non-sensitive.
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* client gone */
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
});

export default router;
