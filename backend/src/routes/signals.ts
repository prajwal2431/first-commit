import { Router, Request, Response } from 'express';
import { getDashboardState, updateResolvedSignalIds } from '../db/dashboardStateRepo';
import { enrichSignal } from '../services/monitors/signalEnricher';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const state = await getDashboardState(orgId);

    if (!state || !state.liveSignals || state.liveSignals.length === 0) {
      return res.json({ signals: [] });
    }

    const filtered = state.liveSignals.filter((s) => !state.resolvedSignalIds?.includes(s.id));
    res.json({ signals: filtered });
  } catch (err) {
    console.error('Signals list error:', err);
    res.status(500).json({ message: 'Failed to fetch signals' });
  }
});

router.get('/:signalId', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { signalId } = req.params;

    const state = await getDashboardState(orgId);
    if (!state || !state.liveSignals) {
      return res.status(404).json({ message: 'No dashboard data found' });
    }

    const signal = state.liveSignals.find((s) => s.id === signalId);
    if (!signal) {
      return res.status(404).json({ message: 'Signal not found' });
    }

    const enriched = await enrichSignal(orgId, signal, state.liveSignals);
    res.json(enriched);
  } catch (err) {
    console.error('Signal insight error:', err);
    res.status(500).json({ message: 'Failed to enrich signal' });
  }
});

router.delete('/:signalId', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const { signalId } = req.params;

    const state = await getDashboardState(orgId);
    if (!state) {
      return res.status(404).json({ message: 'No dashboard data found' });
    }

    const resolved = state.resolvedSignalIds ?? [];
    if (!resolved.includes(signalId)) {
      await updateResolvedSignalIds(orgId, [...resolved, signalId]);
    }

    res.json({ success: true, message: 'Signal dismissed successfully' });
  } catch (err) {
    console.error('Delete signal error:', err);
    res.status(500).json({ message: 'Failed to dismiss signal' });
  }
});

export default router;
