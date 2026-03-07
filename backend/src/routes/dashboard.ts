import { Router, Request, Response } from 'express';
import { getDashboardState } from '../db/dashboardStateRepo';
import { computeAllMonitors } from '../services/monitors/computeAll';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const state = await getDashboardState(orgId);

    if (!state) {
      return res.json({
        revenueAtRiskSeries: [],
        liveSignals: [],
        kpiSummary: null,
        lastComputedAt: null,
      });
    }

    res.json({
      revenueAtRiskSeries: state.revenueAtRiskSeries,
      liveSignals: state.liveSignals.filter((s) => !state.resolvedSignalIds?.includes(s.id)),
      kpiSummary: state.kpiSummary,
      lastComputedAt: state.lastComputedAt,
    });
  } catch (err) {
    console.error('Dashboard fetch error:', err);
    res.status(500).json({ message: 'Failed to load dashboard' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    await computeAllMonitors(orgId);
    const state = await getDashboardState(orgId);
    const payload = state
      ? { ...state, liveSignals: state.liveSignals.filter((s) => !state.resolvedSignalIds?.includes(s.id)) }
      : { message: 'No data to compute' };
    res.json(payload);
  } catch (err) {
    console.error('Dashboard refresh error:', err);
    res.status(500).json({ message: 'Failed to refresh dashboard' });
  }
});

export default router;
