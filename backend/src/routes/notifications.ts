import { Router, Request, Response } from 'express';
import { getDashboardState, updateResolvedSignalIds } from '../db/dashboardStateRepo';
import { getOrgSettings } from '../db/orgSettingsRepo';
import { enrichSignal } from '../services/monitors/signalEnricher';
import { sendEmail, buildSignalInsightEmail } from '../services/emailService';

const router = Router();

router.post('/send-signal', async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.tenantId ?? 'default';
    const senderEmail = req.user?.email ?? 'unknown';
    const { signalId, departmentId, note } = req.body;

    if (!signalId || !departmentId) {
      return res.status(400).json({ message: 'signalId and departmentId are required' });
    }

    const state = await getDashboardState(orgId);
    if (!state?.liveSignals) {
      return res.status(404).json({ message: 'No signals found' });
    }

    const signal = state.liveSignals.find((s) => s.id === signalId);
    if (!signal) {
      return res.status(404).json({ message: 'Signal not found' });
    }

    const settings = await getOrgSettings(orgId);
    const dept = settings?.departments?.find((d) => d.id === departmentId);
    if (!dept) {
      return res.status(404).json({ message: 'Department not found' });
    }
    if (!dept.email) {
      return res.status(400).json({ message: `No email configured for ${dept.name}. Please update in Settings.` });
    }

    const enriched = await enrichSignal(orgId, signal, state.liveSignals);

    const emailContent = buildSignalInsightEmail({
      signalTitle: signal.title,
      severity: signal.severity,
      description: signal.description,
      evidenceSnippet: signal.evidenceSnippet,
      aiSummary: enriched.aiSummary,
      recommendedActions: enriched.recommendedActions.map((a) => a.action),
      senderEmail,
      senderNote: note,
    });

    const result = await sendEmail(orgId, {
      to: dept.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    if (result.success) {
      const resolved = state.resolvedSignalIds ?? [];
      if (!resolved.includes(signalId)) {
        await updateResolvedSignalIds(orgId, [...resolved, signalId]);
      }

      res.json({
        success: true,
        message: `Insight sent to ${dept.name} (${dept.email})`,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
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
