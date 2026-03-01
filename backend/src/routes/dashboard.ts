import { Router, Request, Response } from 'express';
import { DashboardState } from '../models/DashboardState';
import { computeAllMonitors } from '../services/monitors/computeAll';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const state = await DashboardState.findOne({ organizationId: orgId }).lean();

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
      liveSignals: state.liveSignals.filter((s: any) => !state.resolvedSignalIds?.includes(s.id)),
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
    const state = await DashboardState.findOne({ organizationId: orgId }).lean();
    if (state) {
      state.liveSignals = state.liveSignals.filter((s: any) => !state.resolvedSignalIds?.includes(s.id));
    }
    res.json(state ?? { message: 'No data to compute' });
  } catch (err) {
    console.error('Dashboard refresh error:', err);
    res.status(500).json({ message: 'Failed to refresh dashboard' });
  }
});

export default router;
