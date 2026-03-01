import { Router, Request, Response } from 'express';
import { OrgSettings, DEFAULT_THRESHOLDS } from '../models/OrgSettings';
import { computeAllMonitors } from '../services/monitors/computeAll';

const router = Router();

// GET /api/settings — get org settings
router.get('/', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        let settings = await OrgSettings.findOne({ organizationId: orgId }).lean();

        if (!settings) {
            // Create default settings
            const created = await OrgSettings.create({ organizationId: orgId });
            settings = created.toObject() as any;
        }

        // Ensure thresholds always present (for older docs without thresholds)
        if (!settings!.thresholds) {
            (settings as any).thresholds = { ...DEFAULT_THRESHOLDS };
        }

        res.json(settings);
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});

// PUT /api/settings/departments — update departments list
router.put('/departments', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const { departments } = req.body;

        if (!Array.isArray(departments)) {
            return res.status(400).json({ message: 'departments must be an array' });
        }

        // Validate each department
        for (const dept of departments) {
            if (!dept.id || !dept.name) {
                return res.status(400).json({ message: 'Each department must have id and name' });
            }
        }

        const settings = await OrgSettings.findOneAndUpdate(
            { organizationId: orgId },
            { departments },
            { upsert: true, new: true }
        ).lean();

        res.json(settings);
    } catch (err) {
        console.error('Update departments error:', err);
        res.status(500).json({ message: 'Failed to update departments' });
    }
});

// PUT /api/settings/smtp — update SMTP configuration
router.put('/smtp', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const { smtp } = req.body;

        if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
            return res.status(400).json({ message: 'SMTP config requires host, user, and pass' });
        }

        const settings = await OrgSettings.findOneAndUpdate(
            { organizationId: orgId },
            {
                smtp: {
                    host: smtp.host,
                    port: smtp.port || 587,
                    secure: smtp.secure || false,
                    user: smtp.user,
                    pass: smtp.pass,
                    fromName: smtp.fromName || 'Nexus Intelligence',
                    fromEmail: smtp.fromEmail || smtp.user,
                },
            },
            { upsert: true, new: true }
        ).lean();

        res.json(settings);
    } catch (err) {
        console.error('Update SMTP error:', err);
        res.status(500).json({ message: 'Failed to update SMTP settings' });
    }
});

// PUT /api/settings/thresholds — update signal detection thresholds
router.put('/thresholds', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const { thresholds } = req.body;

        if (!thresholds || typeof thresholds !== 'object') {
            return res.status(400).json({ message: 'thresholds must be an object' });
        }

        // Merge with defaults so partial updates work
        const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };

        // Ensure nested objects are properly merged
        if (thresholds.trafficUpCvrDown) {
            merged.trafficUpCvrDown = {
                ...DEFAULT_THRESHOLDS.trafficUpCvrDown,
                ...thresholds.trafficUpCvrDown,
            };
        }

        // Validate numeric ranges
        const numericFields: Array<[string, number, number]> = [
            ['revenueDropWoW', 1, 80],
            ['revenueDropDoD', 1, 80],
            ['aovCollapse', 1, 80],
            ['topSkuRevenueDrop', 1, 80],
            ['oosRateCritical', 1, 100],
            ['oosRateWarning', 0.5, 100],
            ['returnRateWarning', 0.5, 50],
            ['returnRateCritical', 1, 50],
            ['slaAdherenceWarning', 50, 100],
            ['slaAdherenceCritical', 30, 100],
            ['cancelRateWarning', 0.5, 30],
            ['cancelRateCritical', 1, 50],
            ['rtoRateWarning', 1, 40],
            ['rtoRateCritical', 2, 50],
            ['demandSpikeStdDevMultiplier', 0.5, 5],
            ['skuSpikeStdDevMultiplier', 0.5, 5],
            ['skuSpikeMinMultiplier', 1, 10],
        ];

        for (const [field, min, max] of numericFields) {
            const val = (merged as any)[field];
            if (typeof val !== 'number' || val < min || val > max) {
                return res.status(400).json({
                    message: `${field} must be a number between ${min} and ${max}`,
                });
            }
        }

        const settings = await OrgSettings.findOneAndUpdate(
            { organizationId: orgId },
            { thresholds: merged },
            { upsert: true, new: true }
        ).lean();

        // Re-compute monitors so sidebar reflects new thresholds immediately
        computeAllMonitors(orgId).catch((err) => {
            console.error('Background recompute after threshold update failed:', err);
        });

        res.json(settings);
    } catch (err) {
        console.error('Update thresholds error:', err);
        res.status(500).json({ message: 'Failed to update thresholds' });
    }
});

export default router;
