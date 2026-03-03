/**
 * Proactive Email Templates
 *
 * HTML email builders for proactive RCA briefs, daily digests,
 * and escalation alerts. Follows the existing Nexus Intelligence branding.
 */

import { LiveSignal } from '../../models/DashboardState';
import { BriefRootCause, BriefAction } from '../../models/ProactiveBrief';
import { TrendDrift } from './trendDetector';
import { Prediction } from './predictor';

/* ── Proactive Brief Email ───────────────────────────────────────── */

export function buildProactiveBriefEmail(params: {
    title: string;
    summary: string;
    rootCauses: BriefRootCause[];
    actions: BriefAction[];
    suggestedQuestions: string[];
    triggerType: string;
    viewInAppUrl?: string;
}): { subject: string; html: string } {
    const triggerLabels: Record<string, string> = {
        signal: 'Signal Alert',
        scheduled: 'Daily Brief',
        trend_drift: 'Trend Alert',
        correlation: 'Correlated Insight',
        prediction: 'Predictive Warning',
        escalation: 'Escalation Alert',
    };
    const label = triggerLabels[params.triggerType] || 'Proactive Insight';

    const causesHtml = params.rootCauses
        .map(
            (c) =>
                `<li style="margin-bottom: 8px;">
          <strong>${c.cause}</strong> (${c.confidence}% confidence)<br/>
          <span style="color: #666; font-size: 13px;">${c.evidence}</span>
        </li>`
        )
        .join('');

    const actionsHtml = params.actions
        .map(
            (a) =>
                `<li style="margin-bottom: 8px;">
          <span style="display:inline-block;background:${priorityColor(a.priority)};color:white;font-size:10px;padding:1px 6px;text-transform:uppercase;font-family:monospace;letter-spacing:1px;margin-right:6px;">${a.priority}</span>
          ${a.action}${a.owner ? ` → ${a.owner}` : ''}
        </li>`
        )
        .join('');

    const questionsHtml = params.suggestedQuestions
        .map((q) => `<li style="margin-bottom: 4px; color: #2563EB;">${q}</li>`)
        .join('');

    return {
        subject: `[Nexus] ${params.title}`,
        html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      ${headerHtml(label)}

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; margin: 0 0 12px; color: #111;">${params.title}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #333;">${params.summary}</p>
      </div>

      ${causesHtml ? `
      <div style="margin-bottom: 24px;">
        <h3 style="${sectionHeadingStyle}">Root Causes</h3>
        <ul style="padding-left: 0; list-style: none; font-size: 14px; color: #333; line-height: 1.6;">
          ${causesHtml}
        </ul>
      </div>` : ''}

      ${actionsHtml ? `
      <div style="margin-bottom: 24px;">
        <h3 style="${sectionHeadingStyle}">Recommended Actions</h3>
        <ul style="padding-left: 0; list-style: none; font-size: 14px; color: #333; line-height: 1.6;">
          ${actionsHtml}
        </ul>
      </div>` : ''}

      ${questionsHtml ? `
      <div style="background: #F0F9FF; border: 1px solid #BAE6FD; padding: 16px; margin-bottom: 24px;">
        <h3 style="${sectionHeadingStyle}">Questions to Explore</h3>
        <ul style="padding-left: 16px; font-size: 14px; line-height: 1.8;">
          ${questionsHtml}
        </ul>
      </div>` : ''}

      ${params.viewInAppUrl ? `
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${params.viewInAppUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 24px;text-decoration:none;font-size:13px;font-family:monospace;letter-spacing:1px;text-transform:uppercase;">View in Dashboard</a>
      </div>` : ''}

      ${footerHtml}
    </div>`,
    };
}

/* ── Escalation Email ────────────────────────────────────────────── */

export function buildEscalationEmail(params: {
    signals: LiveSignal[];
    hoursPersisted: number;
    escalationLevel: number;
}): { subject: string; html: string } {
    const signalsHtml = params.signals
        .map(
            (s) =>
                `<tr>
          <td style="padding:8px;border-bottom:1px solid #E5E7EB;">
            <span style="display:inline-block;background:${severityColor(s.severity)};color:white;font-size:10px;padding:1px 6px;text-transform:uppercase;font-family:monospace;">${s.severity}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #E5E7EB;font-size:14px;">${s.title}</td>
          <td style="padding:8px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#666;">${s.description.slice(0, 80)}…</td>
        </tr>`
        )
        .join('');

    return {
        subject: `🚨 [Nexus Escalation] ${params.signals.length} Unresolved Critical Signals (Level ${params.escalationLevel})`,
        html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      ${headerHtml('ESCALATION ALERT')}

      <div style="background: #FEF2F2; border-left: 4px solid #DC2626; padding: 16px; margin-bottom: 24px;">
        <h2 style="font-size: 18px; margin: 0 0 8px; color: #991B1B;">
          ${params.signals.length} Critical Signals Unresolved for ${params.hoursPersisted}+ Hours
        </h2>
        <p style="font-size: 14px; color: #991B1B; margin: 0;">
          This is escalation level <strong>${params.escalationLevel}</strong>. These signals require immediate attention.
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#F9FAFB;">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;font-family:monospace;">Severity</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;font-family:monospace;">Signal</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;font-family:monospace;">Description</th>
          </tr>
        </thead>
        <tbody>
          ${signalsHtml}
        </tbody>
      </table>

      ${footerHtml}
    </div>`,
    };
}

/* ── Daily Digest Email ──────────────────────────────────────────── */

export function buildDailyDigestEmail(params: {
    kpiSnapshot: string;
    topSignals: LiveSignal[];
    trendAlerts: TrendDrift[];
    predictions: Prediction[];
    suggestedQuestions: string[];
}): { subject: string; html: string } {
    const signalRows = params.topSignals
        .slice(0, 5)
        .map(
            (s) =>
                `<li style="margin-bottom: 6px;">
          <span style="display:inline-block;background:${severityColor(s.severity)};color:white;font-size:9px;padding:1px 5px;text-transform:uppercase;font-family:monospace;margin-right:4px;">${s.severity}</span>
          ${s.title}
        </li>`
        )
        .join('');

    const trendRows = params.trendAlerts
        .map((t) => `<li style="margin-bottom: 4px;">${t.description}</li>`)
        .join('');

    const predRows = params.predictions
        .filter((p) => p.severity !== 'info')
        .map((p) => `<li style="margin-bottom: 4px;">${p.description}</li>`)
        .join('');

    const questionsHtml = params.suggestedQuestions
        .map((q) => `<li style="margin-bottom: 4px; color: #2563EB;">${q}</li>`)
        .join('');

    const kpiHtml = params.kpiSnapshot
        .split('\n')
        .map((line) => `<div style="font-size:13px;padding:2px 0;font-family:monospace;">${line}</div>`)
        .join('');

    return {
        subject: `[Nexus] Your Daily Decision Brief`,
        html: `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      ${headerHtml('Daily Decision Brief')}

      <div style="background:#F9FAFB;padding:16px;border:1px solid #E5E7EB;margin-bottom:24px;">
        <h3 style="${sectionHeadingStyle}">KPI Snapshot</h3>
        ${kpiHtml}
      </div>

      ${signalRows ? `
      <div style="margin-bottom:24px;">
        <h3 style="${sectionHeadingStyle}">Top Signals</h3>
        <ul style="padding-left:0;list-style:none;font-size:14px;">${signalRows}</ul>
      </div>` : ''}

      ${trendRows ? `
      <div style="margin-bottom:24px;">
        <h3 style="${sectionHeadingStyle}">Trend Alerts</h3>
        <ul style="padding-left:16px;font-size:13px;color:#333;line-height:1.6;">${trendRows}</ul>
      </div>` : ''}

      ${predRows ? `
      <div style="margin-bottom:24px;">
        <h3 style="${sectionHeadingStyle}">Predictions</h3>
        <ul style="padding-left:16px;font-size:13px;color:#333;line-height:1.6;">${predRows}</ul>
      </div>` : ''}

      ${questionsHtml ? `
      <div style="background:#F0F9FF;border:1px solid #BAE6FD;padding:16px;margin-bottom:24px;">
        <h3 style="${sectionHeadingStyle}">Questions to Explore</h3>
        <ul style="padding-left:16px;font-size:14px;line-height:1.8;">${questionsHtml}</ul>
      </div>` : ''}

      ${footerHtml}
    </div>`,
    };
}

/* ── Shared fragments ────────────────────────────────────────────── */

const sectionHeadingStyle =
    'font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#999;font-family:monospace;margin-bottom:8px;';

function headerHtml(label: string): string {
    return `
    <div style="border-bottom:3px solid #000;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="font-size:24px;margin:0;font-style:italic;font-family:Georgia,serif;">Nexus Intelligence</h1>
      <p style="font-size:11px;color:#999;margin:4px 0 0;font-family:monospace;text-transform:uppercase;letter-spacing:2px;">${label}</p>
    </div>`;
}

const footerHtml = `
  <div style="border-top:1px solid #E5E7EB;padding-top:16px;font-size:11px;color:#999;font-family:monospace;">
    <p>Sent by Nexus Intelligence Platform — Proactive RCA Agent</p>
    <p>This is an automated alert based on your data. Review insights and take appropriate action.</p>
  </div>`;

function severityColor(severity: string): string {
    const colors: Record<string, string> = {
        critical: '#DC2626',
        high: '#EA580C',
        medium: '#CA8A04',
        low: '#2563EB',
    };
    return colors[severity] || '#6B7280';
}

function priorityColor(priority: string): string {
    const colors: Record<string, string> = {
        critical: '#DC2626',
        high: '#EA580C',
        medium: '#CA8A04',
        low: '#2563EB',
    };
    return colors[priority] || '#6B7280';
}
