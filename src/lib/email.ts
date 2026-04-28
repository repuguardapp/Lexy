import 'server-only';
import { Resend } from 'resend';
import { supabaseService } from './supabase';

/**
 * Transactional email via Resend.
 *
 * Failure mode: every helper here returns void and swallows network
 * errors. Email is best-effort — a failed delivery must never break the
 * caller (the audit pipeline, the auth flow). Failures land in console
 * + Sentry breadcrumb where applicable.
 *
 * Branding: From = "LexyFlow <hello@lexyflow.com>". The sending domain
 * must be verified in Resend (DNS records — see DEPLOY.md).
 */

const FROM = 'LexyFlow <hello@lexyflow.com>';
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://lexyflow.com';

let client: Resend | null = null;
function resend(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

export interface AuditCompletedEmailArgs {
  organizationId: string;
  auditId: string;
  riskScore: number;
  findingsCount: number;
}

export async function sendAuditCompletedEmail(args: AuditCompletedEmailArgs): Promise<void> {
  const r = resend();
  if (!r) return; // Email disabled in this env — silently skip.

  // Look up the org owner's email. Cheap, single query.
  const { data: org } = await supabaseService()
    .from('organizations')
    .select('id,name')
    .eq('id', args.organizationId)
    .maybeSingle();
  if (!org) return;

  // Find members of the org via auth.users + their app_metadata.
  // For MVP we look up the first member; production should fan out.
  const { data: members } = await supabaseService()
    .auth.admin.listUsers({ page: 1, perPage: 50 });

  const recipients = (members?.users ?? [])
    .filter((u) => (u.app_metadata as { organization_id?: string } | null)?.organization_id === args.organizationId)
    .map((u) => u.email)
    .filter((e): e is string => Boolean(e));

  if (recipients.length === 0) return;

  const url = `${APP_URL()}/dashboard/${args.auditId}`;
  const severity = severityFor(args.riskScore);
  const subject = `Your LexyFlow audit is ready — ${severity} risk (${args.riskScore}/100)`;

  try {
    await r.emails.send({
      from: FROM,
      to: recipients,
      subject,
      html: renderAuditCompletedHtml({ ...args, severity, url, orgName: org.name ?? 'your team' }),
      text: renderAuditCompletedText({ ...args, severity, url })
    });
  } catch (err) {
    console.error('[email] sendAuditCompletedEmail failed', err);
  }
}

function severityFor(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function renderAuditCompletedHtml(args: {
  riskScore: number;
  findingsCount: number;
  severity: string;
  url: string;
  orgName: string;
}): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0d;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8eb;border-radius:12px;">
    <tr><td style="padding:32px 32px 16px 32px;">
      <div style="font-size:14px;color:#6a737d;letter-spacing:.04em;text-transform:uppercase;">LexyFlow</div>
      <h1 style="font-size:24px;line-height:1.2;margin:8px 0 0 0;">Your audit is ready.</h1>
    </td></tr>
    <tr><td style="padding:0 32px 8px 32px;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3a3a3f;">
        Hello ${escapeHtml(args.orgName)} — LexyFlow finished analysing the document you uploaded.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e6e8eb;border-radius:8px;margin:8px 0 24px 0;">
        <tr>
          <td style="padding:16px;border-right:1px solid #e6e8eb;">
            <div style="font-size:12px;color:#6a737d;text-transform:uppercase;letter-spacing:.04em;">Risk score</div>
            <div style="font-size:28px;font-weight:600;margin-top:4px;">${args.riskScore}/100</div>
            <div style="font-size:13px;color:#6a737d;margin-top:2px;text-transform:capitalize;">${args.severity}</div>
          </td>
          <td style="padding:16px;">
            <div style="font-size:12px;color:#6a737d;text-transform:uppercase;letter-spacing:.04em;">Findings</div>
            <div style="font-size:28px;font-weight:600;margin-top:4px;">${args.findingsCount}</div>
          </td>
        </tr>
      </table>
      <a href="${args.url}" style="display:inline-block;background:#0b0b0d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:500;">Open the report →</a>
    </td></tr>
    <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6e8eb;color:#6a737d;font-size:12px;line-height:1.5;">
      Zero-Knowledge: your source document is no longer on our servers. Only this AI-authored report is stored.
    </td></tr>
  </table>
</body></html>`;
}

function renderAuditCompletedText(args: {
  riskScore: number;
  findingsCount: number;
  severity: string;
  url: string;
}): string {
  return [
    'Your LexyFlow audit is ready.',
    '',
    `Risk score : ${args.riskScore}/100 (${args.severity})`,
    `Findings   : ${args.findingsCount}`,
    '',
    `Open the report: ${args.url}`,
    '',
    'Zero-Knowledge: your source document is no longer on our servers.'
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
