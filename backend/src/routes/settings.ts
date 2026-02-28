import { Router, Request, Response } from 'express';
import { OrgSettings } from '../models/OrgSettings';

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

export default router;
