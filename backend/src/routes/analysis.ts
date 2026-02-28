import { Router, Request, Response } from 'express';
import { AnalysisSession } from '../models/AnalysisSession';
import { runFullAnalysis } from '../services/analysis/runAnalysis';

const router = Router();

const activeStreams = new Map<string, Set<Response>>();

router.post('/start', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { query, signalId } = req.body;

    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }

    const session = await AnalysisSession.create({
      organizationId: orgId,
      query,
      signalId,
      status: 'pending',
    });

    runFullAnalysis(
      String(session._id),
      orgId,
      (step) => {
        const listeners = activeStreams.get(String(session._id));
        if (listeners) {
          for (const client of listeners) {
            try {
              client.write(`data: ${JSON.stringify({ type: 'progress', step })}\n\n`);
            } catch { /* client disconnected */ }
          }
        }
      }
    ).then((result) => {
      const listeners = activeStreams.get(String(session._id));
      if (listeners) {
        for (const client of listeners) {
          try {
            client.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
            client.end();
          } catch { /* ignore */ }
        }
        activeStreams.delete(String(session._id));
      }
    }).catch((err) => {
      const listeners = activeStreams.get(String(session._id));
      if (listeners) {
        for (const client of listeners) {
          try {
            client.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
            client.end();
          } catch { /* ignore */ }
        }
        activeStreams.delete(String(session._id));
      }
    });

    res.status(201).json({
      analysisId: session._id,
      status: 'pending',
    });
  } catch (err) {
    console.error('Analysis start error:', err);
    res.status(500).json({ message: 'Failed to start analysis' });
  }
});

router.get('/stream/:id', (req: Request, res: Response) => {
  const id = req.params.id;

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

  AnalysisSession.findOne({ _id: id, organizationId: orgId }).then((session) => {
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
  }).catch(() => { /* ignore */ });

  req.on('close', () => {
    activeStreams.get(id)?.delete(res);
    if (activeStreams.get(id)?.size === 0) {
      activeStreams.delete(id);
    }
  });
});

router.get('/result/:id', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const session = await AnalysisSession.findOne({ _id: req.params.id, organizationId: orgId }).lean();
    if (!session) {
      return res.status(404).json({ message: 'Analysis session not found' });
    }

    res.json({
      id: session._id,
      query: session.query,
      status: session.status,
      steps: session.steps,
      result: session.result ?? null,
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
    const sessions = await AnalysisSession.find({ organizationId: orgId })
      .sort({ startedAt: -1 })
      .limit(20)
      .select('query status startedAt completedAt')
      .lean();

    res.json(sessions);
  } catch (err) {
    console.error('Sessions list error:', err);
    res.status(500).json({ message: 'Failed to list sessions' });
  }
});

router.patch('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    const session = await AnalysisSession.findByIdAndUpdate(
      req.params.id,
      { query: title },
      { new: true }
    );
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
  } catch (err) {
    console.error('Rename session error:', err);
    res.status(500).json({ message: 'Failed to rename session' });
  }
});

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await AnalysisSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json({ message: 'Session deleted successfully' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ message: 'Failed to delete session' });
  }
});

export default router;
