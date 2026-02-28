import nodemailer from 'nodemailer';
import { OrgSettings, SmtpConfig } from '../models/OrgSettings';

interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
}

async function getTransporter(organizationId: string) {
    const settings = await OrgSettings.findOne({ organizationId }).lean();
    const smtp = settings?.smtp;

    if (smtp && smtp.host && smtp.user && smtp.pass) {
        return {
            transporter: nodemailer.createTransport({
                host: smtp.host,
                port: smtp.port || 587,
                secure: smtp.secure || false,
                auth: { user: smtp.user, pass: smtp.pass },
            }),
            from: `"${smtp.fromName || 'Nexus Intelligence'}" <${smtp.fromEmail || smtp.user}>`,
        };
    }

    // Fallback: use env-based SMTP config
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
        return {
            transporter: nodemailer.createTransport({
                host,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: { user, pass },
            }),
            from: `"${process.env.SMTP_FROM_NAME || 'Nexus Intelligence'}" <${process.env.SMTP_FROM_EMAIL || user}>`,
        };
    }

    // Last resort: Ethereal (test account) for development
    const testAccount = await nodemailer.createTestAccount();
    return {
        transporter: nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        }),
        from: `"Nexus Intelligence" <${testAccount.user}>`,
        isEthereal: true,
    };
}

export async function sendEmail(
    organizationId: string,
    options: SendEmailOptions
): Promise<{ success: boolean; previewUrl?: string; messageId?: string }> {
    try {
        const { transporter, from, isEthereal } = await getTransporter(organizationId) as any;

        const info = await transporter.sendMail({
            from,
            to: options.to,
            subject: options.subject,
            html: options.html,
        });

        const result: any = { success: true, messageId: info.messageId };
        if (isEthereal) {
            result.previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
            console.log('[email] Ethereal preview:', result.previewUrl);
        }
        console.log(`[email] Sent to ${options.to}: ${info.messageId}`);
        return result;
    } catch (error) {
        console.error('[email] Failed to send:', error);
        return { success: false };
    }
}

export function buildSignalInsightEmail(params: {
    signalTitle: string;
    severity: string;
    description: string;
    evidenceSnippet: string;
    aiSummary: string;
    recommendedActions: string[];
    senderEmail: string;
    senderNote?: string;
}): { subject: string; html: string } {
    const severityColors: Record<string, string> = {
        critical: '#DC2626',
        high: '#EA580C',
        medium: '#CA8A04',
        low: '#2563EB',
    };
    const color = severityColors[params.severity] || '#6B7280';

    const actionsHtml = params.recommendedActions
        .map((a, i) => `<li style="margin-bottom: 8px;">${i + 1}. ${a}</li>`)
        .join('');

    return {
        subject: `[Nexus Alert] ${params.signalTitle}`,
        html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="border-bottom: 3px solid #000; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 24px; margin: 0; font-style: italic; font-family: Georgia, serif;">Nexus Intelligence</h1>
          <p style="font-size: 11px; color: #999; margin: 4px 0 0; font-family: monospace; text-transform: uppercase; letter-spacing: 2px;">Signal Alert</p>
        </div>

        <div style="background: ${color}15; border-left: 4px solid ${color}; padding: 16px; margin-bottom: 24px;">
          <span style="display: inline-block; background: ${color}; color: white; font-size: 10px; padding: 2px 8px; text-transform: uppercase; font-family: monospace; letter-spacing: 1px; margin-bottom: 8px;">${params.severity}</span>
          <h2 style="font-size: 18px; margin: 8px 0 4px; color: #111;">${params.signalTitle}</h2>
          <p style="font-size: 14px; color: #555; margin: 0;">${params.description}</p>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-family: monospace; margin-bottom: 8px;">AI Summary</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #333;">${params.aiSummary}</p>
        </div>

        <div style="background: #F9FAFB; padding: 16px; margin-bottom: 24px; border: 1px solid #E5E7EB;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-family: monospace; margin-bottom: 8px;">Evidence</h3>
          <p style="font-size: 14px; color: #333; font-family: monospace;">${params.evidenceSnippet}</p>
        </div>

        <div style="margin-bottom: 24px;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-family: monospace; margin-bottom: 8px;">Recommended Actions</h3>
          <ul style="padding-left: 0; list-style: none; font-size: 14px; color: #333; line-height: 1.8;">
            ${actionsHtml}
          </ul>
        </div>

        ${params.senderNote ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; margin-bottom: 24px;">
            <p style="font-size: 12px; color: #92400E; margin: 0;"><strong>Note from sender:</strong> ${params.senderNote}</p>
          </div>
        ` : ''}

        <div style="border-top: 1px solid #E5E7EB; padding-top: 16px; font-size: 11px; color: #999; font-family: monospace;">
          <p>Sent by ${params.senderEmail} via Nexus Intelligence Platform</p>
          <p>This is an automated alert. Review the data and take appropriate action.</p>
        </div>
      </div>
    `,
    };
}
