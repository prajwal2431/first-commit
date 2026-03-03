/**
 * Escalation Manager
 *
 * Monitors unresolved critical signals and auto-escalates to
 * tier-2 recipients if they persist beyond the configured threshold.
 */

import { DashboardState, LiveSignal } from '../../models/DashboardState';
import { OrgSettings, DEFAULT_PROACTIVE_CONFIG, ProactiveConfig } from '../../models/OrgSettings';
import { ProactiveBrief } from '../../models/ProactiveBrief';
import { ProactiveRun } from '../../models/ProactiveRun';
import { sendEmail } from '../emailService';
import { buildEscalationEmail } from './emailTemplates';

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Check all orgs for unresolved critical signals and escalate if needed.
 * Designed to be called periodically (e.g. every hour).
 */
export async function runEscalationCheck(): Promise<void> {
    console.log('[escalation] Running escalation check...');

    // Find all orgs that have proactive enabled
    const orgs = await OrgSettings.find({
        'proactiveConfig.enabled': true,
        'proactiveConfig.escalationEmails': { $exists: true, $ne: [] },
    }).lean();

    for (const org of orgs) {
        try {
            await checkOrgEscalation(
                org.organizationId,
                org.proactiveConfig ?? DEFAULT_PROACTIVE_CONFIG
            );
        } catch (err) {
            console.error(`[escalation] Failed for org=${org.organizationId}:`, err);
        }
    }

    console.log(`[escalation] Check complete. Processed ${orgs.length} orgs.`);
}

async function checkOrgEscalation(
    organizationId: string,
    config: ProactiveConfig,
): Promise<void> {
    const escalationMs = (config.escalationHours || 4) * 3600 * 1000;
    const cutoff = new Date(Date.now() - escalationMs);

    // Get current dashboard state
    const dashState = await DashboardState.findOne({ organizationId }).lean();
    if (!dashState?.liveSignals) return;

    const resolvedIds = new Set(dashState.resolvedSignalIds || []);

    // Find critical/high signals that have been active longer than the escalation window
    const unresolvedCritical = (dashState.liveSignals as LiveSignal[]).filter(
        (s) =>
            (s.severity === 'critical' || s.severity === 'high') &&
            !resolvedIds.has(s.id) &&
            new Date(s.detectedAt) < cutoff
    );

    if (unresolvedCritical.length === 0) return;

    // Check if we already escalated recently (within escalation window)
    const recentEscalation = await ProactiveRun.findOne({
        organizationId,
        triggerType: 'escalation',
        startedAt: { $gte: cutoff },
        status: { $in: ['completed', 'running'] },
    }).lean();

    if (recentEscalation) return; // Already escalated recently

    console.log(
        `[escalation] org=${organizationId}: ${unresolvedCritical.length} unresolved critical/high signals past ${config.escalationHours}h threshold`
    );

    // Determine escalation level
    const previousEscalations = await ProactiveRun.countDocuments({
        organizationId,
        triggerType: 'escalation',
    });
    const escalationLevel = previousEscalations + 1;

    // Create run record
    const run = await ProactiveRun.create({
        organizationId,
        triggerType: 'escalation',
        status: 'running',
        startedAt: new Date(),
        signalSnapshot: unresolvedCritical.map((s) => s.id),
        escalationLevel,
    });

    try {
        // Create an escalation brief
        const brief = await ProactiveBrief.create({
            organizationId,
            triggerType: 'escalation',
            content: {
                title: `⚠️ Escalation Alert — ${unresolvedCritical.length} Unresolved Critical Signals`,
                summary: `${unresolvedCritical.length} critical/high severity signals have remained unresolved for over ${config.escalationHours} hours. This is escalation level ${escalationLevel}.`,
                rootCauses: unresolvedCritical.map((s) => ({
                    cause: s.title,
                    confidence: 80,
                    evidence: s.evidenceSnippet || s.description,
                })),
                actions: [
                    {
                        action: 'Review and address the unresolved critical signals immediately',
                        priority: 'critical' as const,
                    },
                    {
                        action: 'Assign owners to each signal and set resolution timelines',
                        priority: 'high' as const,
                    },
                ],
                suggestedQuestions: unresolvedCritical.map((s) =>
                    s.suggestedQuery || `Why is "${s.title}" still unresolved?`
                ),
            },
            sourceSignalIds: unresolvedCritical.map((s) => s.id),
        });

        // Send escalation emails
        const recipients = config.escalationEmails || [];
        for (const email of recipients) {
            const { subject, html } = buildEscalationEmail({
                signals: unresolvedCritical,
                hoursPersisted: config.escalationHours,
                escalationLevel,
            });
            await sendEmail(organizationId, { to: email, subject, html });
        }

        // Update run
        run.status = 'completed';
        run.completedAt = new Date();
        run.briefId = String(brief._id);
        await run.save();

        // Update brief
        brief.emailedAt = new Date();
        brief.recipientCount = recipients.length;
        await brief.save();

        console.log(
            `[escalation] org=${organizationId}: Escalation sent to ${recipients.length} recipients (level ${escalationLevel})`
        );
    } catch (err) {
        run.status = 'failed';
        run.errorMessage = err instanceof Error ? err.message : 'Escalation failed';
        await run.save();
        throw err;
    }
}
