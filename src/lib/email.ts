import 'server-only';
import { Resend } from 'resend';
import { emailStringsFor, type AuditCompletedStrings } from './email-i18n';
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

/* ------------------------------------------------------------------ */
/* Audit completed                                                    */
/* ------------------------------------------------------------------ */

export interface AuditCompletedEmailArgs {
  organizationId: string;
  auditId: string;
  riskScore: number;
  findingsCount: number;
}

export async function sendAuditCompletedEmail(args: AuditCompletedEmailArgs): Promise<void> {
  // Wrap the entire body in a try/catch so this best-effort notification
  // can never produce an unhandled promise rejection — the audit
  // pipeline calls us with `void` and a stray rejection here used to
  // bubble up to the waitUntil runtime as a spurious error log even
  // though the audit itself had already completed successfully.
  try {
    const r = resend();
    if (!r) return; // Email disabled in this env — silently skip.

    const admin = supabaseService();

    // Look up the org owner's email + UI locale. Cheap, single query.
    const { data: org } = await admin
      .from('organizations')
      .select('id,name,ui_locale')
      .eq('id', args.organizationId)
      .maybeSingle();
    if (!org) return;

    // Find members of the org via auth.users + their app_metadata. For MVP
    // we send to all members; production should respect notification prefs.
    const { data: members } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });

    const recipients = (members?.users ?? [])
      .filter((u) => (u.app_metadata as { organization_id?: string } | null)?.organization_id === args.organizationId)
      .map((u) => u.email)
      .filter((e): e is string => Boolean(e));

    if (recipients.length === 0) return;

    const url = `${APP_URL()}/dashboard/${args.auditId}`;
    const severity = severityFor(args.riskScore);
    const strings = emailStringsFor(org.ui_locale);
    const subject = strings.subject(severity, args.riskScore);

    await r.emails.send({
      from: FROM,
      to: recipients,
      subject,
      html: renderAuditCompletedHtml({ ...args, severity, url, orgName: org.name ?? 'your team', strings }),
      text: renderAuditCompletedText({ ...args, severity, url, strings })
    });
  } catch (err) {
    console.error('[email] sendAuditCompletedEmail failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* Magic link (Supabase Auth Email Hook)                              */
/* ------------------------------------------------------------------ */

export interface MagicLinkEmailArgs {
  to: string;
  link: string;
  /** Optional locale for the email copy. */
  locale?: string;
}

const MAGIC_SUBJECT: Record<string, string> = {
  en:    'Your LexyFlow sign-in link',
  fr:    'Votre lien de connexion LexyFlow',
  es:    'Tu enlace de acceso a LexyFlow',
  de:    'Ihr LexyFlow-Anmeldelink',
  'pt-br': 'Seu link de acesso ao LexyFlow',
  ja:    'LexyFlow へのログインリンク'
};

const MAGIC_BODY: Record<string, { lead: string; cta: string; safety: string }> = {
  en: {
    lead: 'Tap the button below to sign in. The link is valid for 60 minutes and works on one device.',
    cta:  'Sign in to LexyFlow',
    safety: "If you didn't request this, ignore this email — no account changes will happen."
  },
  fr: {
    lead: "Cliquez sur le bouton ci-dessous pour vous connecter. Lien valable 60 minutes, sur un seul appareil.",
    cta:  'Se connecter à LexyFlow',
    safety: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — aucun compte ne sera modifié."
  },
  es: {
    lead: 'Toca el botón para iniciar sesión. El enlace es válido durante 60 minutos y funciona en un solo dispositivo.',
    cta:  'Iniciar sesión en LexyFlow',
    safety: 'Si no solicitaste esto, ignora este correo — no se harán cambios.'
  },
  de: {
    lead: 'Tippen Sie auf die Schaltfläche, um sich anzumelden. Der Link gilt 60 Minuten und funktioniert auf einem Gerät.',
    cta:  'Bei LexyFlow anmelden',
    safety: 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail — es werden keine Änderungen vorgenommen.'
  },
  'pt-br': {
    lead: 'Toque no botão abaixo para entrar. O link é válido por 60 minutos e funciona em um dispositivo.',
    cta:  'Entrar no LexyFlow',
    safety: 'Se você não pediu isso, ignore este e-mail — nada será alterado.'
  },
  ja: {
    lead: '下のボタンをタップしてサインインしてください。リンクは 60 分間、1 つの端末でのみ有効です。',
    cta:  'LexyFlow にサインイン',
    safety: '心当たりがない場合はこのメールを無視してください。アカウントは変更されません。'
  }
};

export async function sendMagicLinkEmail(args: MagicLinkEmailArgs): Promise<void> {
  try {
    const r = resend();
    if (!r) return;

    const locale = (args.locale ?? 'en').toLowerCase();
    const subject = MAGIC_SUBJECT[locale] ?? MAGIC_SUBJECT.en!;
    const body = MAGIC_BODY[locale] ?? MAGIC_BODY.en!;

    await r.emails.send({
      from: FROM,
      to: args.to,
      subject,
      html: renderMagicLinkHtml({ link: args.link, body }),
      text: `${body.lead}\n\n${args.link}\n\n${body.safety}`
    });
  } catch (err) {
    console.error('[email] sendMagicLinkEmail failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                          */
/* ------------------------------------------------------------------ */

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
  strings: AuditCompletedStrings;
}): string {
  const s = args.strings;
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0d;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8eb;border-radius:12px;">
    <tr><td style="padding:32px 32px 16px 32px;">
      <div style="font-size:14px;color:#6a737d;letter-spacing:.04em;text-transform:uppercase;">LexyFlow</div>
      <h1 style="font-size:24px;line-height:1.2;margin:8px 0 0 0;">${escapeHtml(s.heading)}</h1>
    </td></tr>
    <tr><td style="padding:0 32px 8px 32px;">
      <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#3a3a3f;">
        ${escapeHtml(s.greeting(args.orgName))}
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e6e8eb;border-radius:8px;margin:8px 0 24px 0;">
        <tr>
          <td style="padding:16px;border-right:1px solid #e6e8eb;">
            <div style="font-size:12px;color:#6a737d;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(s.riskScoreLabel)}</div>
            <div style="font-size:28px;font-weight:600;margin-top:4px;">${args.riskScore}/100</div>
            <div style="font-size:13px;color:#6a737d;margin-top:2px;text-transform:capitalize;">${args.severity}</div>
          </td>
          <td style="padding:16px;">
            <div style="font-size:12px;color:#6a737d;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(s.findingsLabel)}</div>
            <div style="font-size:28px;font-weight:600;margin-top:4px;">${args.findingsCount}</div>
          </td>
        </tr>
      </table>
      <a href="${args.url}" style="display:inline-block;background:#0b0b0d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:500;">${escapeHtml(s.cta)}</a>
    </td></tr>
    <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #e6e8eb;color:#6a737d;font-size:12px;line-height:1.5;">
      ${escapeHtml(s.zeroKnowledgeFooter)}
    </td></tr>
  </table>
</body></html>`;
}

function renderAuditCompletedText(args: {
  riskScore: number;
  findingsCount: number;
  severity: string;
  url: string;
  strings: AuditCompletedStrings;
}): string {
  const s = args.strings;
  return [
    s.textHeader,
    '',
    `${s.riskScoreLabel}: ${args.riskScore}/100 (${args.severity})`,
    `${s.findingsLabel}: ${args.findingsCount}`,
    '',
    `${s.cta.replace(/\s*→\s*$/, '')}: ${args.url}`,
    '',
    s.zeroKnowledgeFooter
  ].join('\n');
}

function renderMagicLinkHtml(args: { link: string; body: { lead: string; cta: string; safety: string } }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0d;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e8eb;border-radius:12px;">
    <tr><td style="padding:32px;">
      <div style="font-size:14px;color:#6a737d;letter-spacing:.04em;text-transform:uppercase;">LexyFlow</div>
      <p style="margin:16px 0 24px 0;font-size:15px;line-height:1.55;">${escapeHtml(args.body.lead)}</p>
      <a href="${args.link}" style="display:inline-block;background:#0b0b0d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:500;">${escapeHtml(args.body.cta)}</a>
      <p style="margin:24px 0 0 0;font-size:12px;color:#6a737d;line-height:1.5;">${escapeHtml(args.body.safety)}</p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
