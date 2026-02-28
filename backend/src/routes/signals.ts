import { Router, Request, Response } from 'express';
import { DashboardState } from '../models/DashboardState';
import { enrichSignal } from '../services/monitors/signalEnricher';

const router = Router();

// GET /api/signals — list all live signals (lightweight)
router.get('/', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const state = await DashboardState.findOne({ organizationId: orgId }).lean();

        if (!state || !state.liveSignals || state.liveSignals.length === 0) {
            return res.json({ signals: [] });
        }

        res.json({ signals: state.liveSignals });
    } catch (err) {
        console.error('Signals list error:', err);
        res.status(500).json({ message: 'Failed to fetch signals' });
    }
});

// GET /api/signals/:signalId — get enriched signal insight
router.get('/:signalId', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const { signalId } = req.params;

        const state = await DashboardState.findOne({ organizationId: orgId }).lean();
        if (!state || !state.liveSignals) {
            return res.status(404).json({ message: 'No dashboard data found' });
        }

        const signal = state.liveSignals.find((s: any) => s.id === signalId);
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

export default router;
