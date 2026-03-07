import { Router, Request, Response } from 'express';
import {
  getAnalysisSession,
  createAnalysisSession,
  updateAnalysisSession,
  listAnalysisSessionsByOrg,
  deleteAnalysisSession,
} from '../db/analysisSessionRepo';
import { runFullAnalysis } from '../services/analysis/runAnalysis';

const router = Router();

function isValidSessionId(id: string): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}

const activeStreams = new Map<string, Set<Response>>();

router.post('/start', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { query, signalId } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }

    const session = await createAnalysisSession({
      organizationId: orgId,
      query,
      signalId,
      status: 'pending',
    });

    runFullAnalysis(
      session.sessionId,
      orgId,
      (step) => {
        const listeners = activeStreams.get(session.sessionId);
        if (listeners) {
          for (const client of listeners) {
            try {
              client.write(`data: ${JSON.stringify({ type: 'progress', step })}\n\n`);
            } catch {
              /* client disconnected */
            }
          }
        }
      }
    )
      .then((result) => {
        const listeners = activeStreams.get(session.sessionId);
        if (listeners) {
          for (const client of listeners) {
            try {
              client.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
              client.end();
            } catch {
              /* ignore */
            }
          }
          activeStreams.delete(session.sessionId);
        }
      })
      .catch((err) => {
        const listeners = activeStreams.get(session.sessionId);
        if (listeners) {
          for (const client of listeners) {
            try {
              client.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
              client.end();
            } catch {
              /* ignore */
            }
          }
          activeStreams.delete(session.sessionId);
        }
      });

    res.status(201).json({
      analysisId: session.sessionId,
      status: 'pending',
    });
  } catch (err) {
    console.error('Analysis start error:', err);
    res.status(500).json({ message: 'Failed to start analysis' });
  }
});

router.get('/stream/:id', (req: Request, res: Response) => {
  const id = req.params.id.trim();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!activeStreams.has(id)) {
    activeStreams.set(id, new Set());
  }
  activeStreams.get(id)!.add(res);

  const orgId = req.user?.tenantId ?? 'default';

  getAnalysisSession(orgId, id).then((session) => {
    if (session) {
      if (session.status === 'completed' && session.result) {
        res.write(`data: ${JSON.stringify({ type: 'complete', result: session.result })}\n\n`);
        res.end();
        activeStreams.get(id)?.delete(res);
        return;
      }
      if (session.steps && session.steps.length > 0) {
        for (const step of session.steps) {
          res.write(`data: ${JSON.stringify({ type: 'progress', step })}\n\n`);
        }
      }
    }
  }).catch(() => {
    /* ignore */
  });

  req.on('close', () => {
    activeStreams.get(id)?.delete(res);
    if (activeStreams.get(id)?.size === 0) {
      activeStreams.delete(id);
    }
  });
});

router.get('/result/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id.trim();
    if (!isValidSessionId(id)) {
      return res.status(400).json({ message: 'Invalid session id' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const session = await getAnalysisSession(orgId, id);
    if (!session) {
      return res.status(404).json({ message: 'Analysis session not found' });
    }

    res.json({
      id: session.sessionId,
      query: session.query,
      status: session.status,
      steps: session.steps,
      result: session.result ?? null,
      messages: session.messages || [],
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      errorMessage: session.errorMessage,
    });
  } catch (err) {
    console.error('Analysis result error:', err);
    res.status(500).json({ message: 'Failed to load analysis result' });
  }
});

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const sessions = await listAnalysisSessionsByOrg(orgId, 20);

    res.json(sessions.map((s) => ({
      sessionId: s.sessionId,
      query: s.query,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })));
  } catch (err) {
    console.error('Sessions list error:', err);
    res.status(500).json({ message: 'Failed to list sessions' });
  }
});

router.patch('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const id = req.params.id.trim();
    if (!isValidSessionId(id)) {
      return res.status(400).json({ message: 'Invalid session id' });
    }
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const session = await getAnalysisSession(orgId, id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    await updateAnalysisSession(orgId, id, { query: title });
    res.json({ ...session, query: title });
  } catch (err) {
    console.error('Rename session error:', err);
    res.status(500).json({ message: 'Failed to rename session' });
  }
});

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id.trim();
    if (!isValidSessionId(id)) {
      return res.status(400).json({ message: 'Invalid session id' });
    }
    const orgId = req.user?.tenantId ?? 'default';
    const session = await getAnalysisSession(orgId, id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    await deleteAnalysisSession(orgId, id);
    res.json({ message: 'Session deleted successfully' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ message: 'Failed to delete session' });
  }
});

export default router;
