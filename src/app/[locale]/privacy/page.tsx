import { unstable_setRequestLocale } from 'next-intl/server';
import { LegalShell } from '@/components/LegalShell';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/privacy');
  return {
    title: 'Privacy Policy — LexyFlow',
    alternates: { canonical: `/${params.locale}/privacy`, languages: alternates }
  };
}

export default async function PrivacyPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <LegalShell title="Privacy Policy" effective="January 1, 2026">
      <p>
        LexyFlow (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an AI-powered
        compliance audit service at <a href="https://lexyflow.com">lexyflow.com</a>.
        This Privacy Policy explains what personal data we process, why, and
        the rights you can exercise — under the GDPR (EU/EEA), the UK GDPR,
        the LGPD (Brazil), the APPI (Japan), the CCPA/CPRA (California),
        and any other applicable data-protection law.
      </p>

      <h2>1. Data controller</h2>
      <p>
        LexyFlow is the controller of the personal data described below.
        Contact: <a href="mailto:privacy@lexyflow.com">privacy@lexyflow.com</a>.
      </p>

      <h2>2. Data we process</h2>
      <h3>2.1 Account data</h3>
      <ul>
        <li>email address (magic-link sign-in);</li>
        <li>organisation name, country and default report language;</li>
        <li>session cookies issued by our identity provider, Supabase Auth.</li>
      </ul>

      <h3>2.2 Billing data</h3>
      <ul>
        <li>billing address, tax ID and payment-method tokens — handled by Stripe Inc.;</li>
        <li>subscription status, plan and renewal dates — kept by us.</li>
      </ul>

      <h3>2.3 Audit data — Zero-Knowledge</h3>
      <p>
        When you upload a document for audit, we extract its text in
        memory, hash it (SHA-256), run our Multi-Pass engine, and{' '}
        <strong>immediately wipe the source bytes</strong>. We never write
        your source document to disk. We persist only:
      </p>
      <ul>
        <li>the SHA-256 hash (so re-uploads are deduplicated);</li>
        <li>the AI-authored audit report;</li>
        <li>verbatim quotations from the source as &ldquo;evidence&rdquo; in
          the report. By submitting a document, you instruct us to extract
          and store such quotations as part of the report.</li>
      </ul>

      <h3>2.4 Technical logs</h3>
      <ul>
        <li>IP address (truncated after 7 days);</li>
        <li>user-agent and language headers;</li>
        <li>request timing and error traces, scrubbed of sensitive fields.</li>
      </ul>

      <h2>3. Lawful bases (GDPR Art. 6 / LGPD Art. 7)</h2>
      <ul>
        <li><strong>Performance of a contract</strong> — running audits and providing the dashboard.</li>
        <li><strong>Legitimate interest</strong> — fraud prevention, abuse detection, service security (rate limits, anomaly logs).</li>
        <li><strong>Consent</strong> — optional product-update emails. Withdrawable at any time.</li>
        <li><strong>Legal obligation</strong> — tax records (Stripe), regulator requests where lawful.</li>
      </ul>

      <h2>4. AI sub-processors</h2>
      <p>
        To produce reports we transmit your extracted document text to:
      </p>
      <ul>
        <li>Anthropic, PBC (USA) — Claude 3.5 Sonnet, audit pass.</li>
        <li>OpenAI, L.L.C. (USA) — GPT-4o, localisation pass.</li>
      </ul>
      <p>
        Both providers commit not to train their models on Business / API
        traffic and offer Standard Contractual Clauses for EEA→US transfers.
        We forward only the extracted text and never your account or
        billing data.
      </p>

      <h2>5. Other sub-processors</h2>
      <ul>
        <li>Supabase Inc. (USA) — Postgres database, authentication.</li>
        <li>Stripe Payments Europe Ltd. (Ireland) — billing, tax.</li>
        <li>Vercel Inc. (USA) — hosting, edge network.</li>
        <li>Resend Labs Inc. (USA) — transactional email.</li>
        <li>Functional Software Inc. dba Sentry (USA) — error monitoring,
          PII scrubbed at the SDK layer.</li>
      </ul>

      <h2>6. International transfers</h2>
      <p>
        Where data leaves the EEA / UK / Brazil / Japan, we rely on
        Standard Contractual Clauses (EU 2021/914), the UK IDTA, the LGPD
        SCCs, or the equivalent recognised mechanism. A copy of the
        relevant clauses is available on request.
      </p>

      <h2>7. Retention</h2>
      <ul>
        <li>Source documents — wiped within seconds of audit completion.</li>
        <li>Audit reports — kept for the lifetime of your subscription, then 30 days.</li>
        <li>Billing records — 10 years (legal obligation).</li>
        <li>Technical logs — 7 days after IP truncation.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>
        You have the right to access, rectify, erase, restrict and port
        your personal data, to object to processing, and to lodge a
        complaint with a supervisory authority (e.g.{' '}
        <a href="https://www.cnil.fr">CNIL</a>,{' '}
        <a href="https://www.gov.br/anpd">ANPD</a>,{' '}
        <a href="https://www.ppc.go.jp">PPC</a>,{' '}
        <a href="https://ico.org.uk">ICO</a>).
        Email <a href="mailto:privacy@lexyflow.com">privacy@lexyflow.com</a> —
        we respond within 30 days.
      </p>

      <h2>9. Security</h2>
      <p>
        TLS 1.3 in transit, AES-256 at rest. Postgres row-level security
        scopes every read to your organisation. Source documents never
        touch disk. Production access is logged and limited to two named
        engineers under contractual confidentiality.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may amend this Policy. Material changes are notified by email
        at least 30 days before taking effect. The effective date above is
        always the latest version.
      </p>

      <p className="text-sm text-muted-foreground">
        Locale viewed: <code>{locale}</code> · this document is the
        authoritative English version. Translations are provided for
        convenience.
      </p>
    </LegalShell>
  );
}
