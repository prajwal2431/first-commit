import { Router, Request, Response } from 'express';
import { DashboardState } from '../models/DashboardState';
import { OrgSettings } from '../models/OrgSettings';
import { enrichSignal } from '../services/monitors/signalEnricher';
import { sendEmail, buildSignalInsightEmail } from '../services/emailService';

const router = Router();

// POST /api/notifications/send-signal — send signal insight to a department
router.post('/send-signal', async (req: Request, res: Response) => {
    try {
        const orgId = req.user?.tenantId ?? 'default';
        const senderEmail = req.user?.email ?? 'unknown';
        const { signalId, departmentId, note } = req.body;

        if (!signalId || !departmentId) {
            return res.status(400).json({ message: 'signalId and departmentId are required' });
        }

        // Get the signal
        const state = await DashboardState.findOne({ organizationId: orgId }).lean();
        if (!state?.liveSignals) {
            return res.status(404).json({ message: 'No signals found' });
        }

        const signal = state.liveSignals.find((s: any) => s.id === signalId);
        if (!signal) {
            return res.status(404).json({ message: 'Signal not found' });
        }

        // Get the department email
        const settings = await OrgSettings.findOne({ organizationId: orgId }).lean();
        const dept = settings?.departments?.find((d: any) => d.id === departmentId);
        if (!dept) {
            return res.status(404).json({ message: 'Department not found' });
        }
        if (!dept.email) {
            return res.status(400).json({ message: `No email configured for ${dept.name}. Please update in Settings.` });
        }

        // Enrich the signal for the email
        const enriched = await enrichSignal(orgId, signal, state.liveSignals);

        // Build and send the email
        const emailContent = buildSignalInsightEmail({
            signalTitle: signal.title,
            severity: signal.severity,
            description: signal.description,
            evidenceSnippet: signal.evidenceSnippet,
            aiSummary: enriched.aiSummary,
            recommendedActions: enriched.recommendedActions.map(a => a.action),
            senderEmail,
            senderNote: note,
        });

        const result = await sendEmail(orgId, {
            to: dept.email,
            subject: emailContent.subject,
            html: emailContent.html,
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Insight sent to ${dept.name} (${dept.email})`,
                messageId: result.messageId,
                previewUrl: result.previewUrl, // Only present for Ethereal (dev)
            });
        } else {
            res.status(500).json({ message: 'Failed to send email. Check SMTP configuration in Settings.' });
        }
    } catch (err) {
        console.error('Send signal notification error:', err);
        res.status(500).json({ message: 'Failed to send notification' });
    }
});

export default router;
