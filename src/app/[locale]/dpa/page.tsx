import { unstable_setRequestLocale } from 'next-intl/server';
import { LegalShell } from '@/components/LegalShell';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/dpa');
  return {
    title: 'Data Processing Agreement — LexyFlow',
    alternates: { canonical: `/${params.locale}/dpa`, languages: alternates }
  };
}

export default async function DpaPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <LegalShell title="Data Processing Agreement (DPA)" effective="January 1, 2026">
      <p>
        This Data Processing Agreement (&ldquo;DPA&rdquo;) supplements the
        LexyFlow Terms of Service. It applies whenever LexyFlow processes
        Personal Data on your behalf as a processor under the GDPR (and
        equivalent operator/operatorlike roles under the LGPD, APPI, UK
        GDPR and similar regimes). By using LexyFlow you accept this DPA;
        signed counterparts are available on request at{' '}
        <a href="mailto:legal@lexyflow.com">legal@lexyflow.com</a>.
      </p>

      <h2>1. Definitions</h2>
      <p>
        Capitalised terms not defined here have the meaning given in
        GDPR Art. 4 / LGPD Art. 5. &ldquo;Customer&rdquo; means the entity
        accepting the Terms. &ldquo;Personal Data&rdquo; means any data
        that identifies or relates to an identifiable person.
      </p>

      <h2>2. Roles and scope</h2>
      <ul>
        <li><strong>Customer</strong> is the controller of any Personal Data submitted to LexyFlow as part of audit documents.</li>
        <li><strong>LexyFlow</strong> is the processor and acts only on Customer&apos;s documented instructions, namely: extracting text, running the Multi-Pass engine, returning the report, and providing access via the dashboard.</li>
      </ul>

      <h2>3. Categories of data and data subjects</h2>
      <p>Personal Data may appear inside Customer-submitted documents:</p>
      <ul>
        <li><strong>Categories of data</strong>: identifiers, contact data, professional data, occasionally special-category data depending on the document.</li>
        <li><strong>Data subjects</strong>: Customer&apos;s employees, users, suppliers or other parties whose data appears in the submitted document.</li>
      </ul>

      <h2>4. Sub-processors</h2>
      <p>
        Customer authorises the sub-processors listed in Section 4–5 of
        the Privacy Policy. We will give 30 days&apos; advance notice of
        new sub-processors via the dashboard; Customer may object on
        reasonable grounds and, failing resolution, terminate without penalty.
      </p>

      <h2>5. Sub-processor obligations</h2>
      <p>
        Each sub-processor is bound by data-protection terms no less
        protective than those in this DPA. Anthropic, OpenAI, Supabase,
        Stripe, Vercel, Resend and Sentry have all signed Standard
        Contractual Clauses (or equivalent) for cross-border transfers.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Where Personal Data leaves the EEA, UK, Brazil or Japan, transfers
        are made under the relevant Standard Contractual Clauses
        (EU 2021/914 modules 2 and 3, UK IDTA, ANPD SCCs). LexyFlow
        maintains transfer-impact assessments and provides them to
        Customer on request.
      </p>

      <h2>7. Security measures</h2>
      <ul>
        <li>TLS 1.3 in transit; AES-256 at rest.</li>
        <li>Source documents wiped from memory immediately after audit (Zero-Knowledge).</li>
        <li>Postgres row-level security: every query scoped to Customer&apos;s organisation.</li>
        <li>Production access limited to two named engineers under NDA.</li>
        <li>Quarterly access reviews; annual third-party penetration test.</li>
        <li>Secrets stored in Vercel/GitHub encrypted secret stores; no secret in code.</li>
        <li>Incident response plan with 24-hour notification SLA to Customer.</li>
      </ul>

      <h2>8. Confidentiality</h2>
      <p>
        Personnel with access to Personal Data are bound by written
        confidentiality obligations surviving termination of their
        engagement.
      </p>

      <h2>9. Data-subject requests</h2>
      <p>
        We forward to Customer any request from a data subject and, on
        Customer&apos;s instruction, assist by providing tools to respond
        (export, delete) within statutory deadlines.
      </p>

      <h2>10. Personal Data Breach</h2>
      <p>
        We notify Customer without undue delay (and in any event within
        24 hours of becoming aware) of any Personal Data Breach affecting
        Customer Data, with the information required by GDPR Art. 33(3) /
        LGPD Art. 48.
      </p>

      <h2>11. Audits</h2>
      <p>
        Customer may, no more than once per year, request information
        sufficient to demonstrate compliance with this DPA. Where
        Customer reasonably requires an on-site audit, parties agree on
        scope and timing in good faith; cost is borne by Customer unless
        material non-compliance is found.
      </p>

      <h2>12. Return and deletion</h2>
      <p>
        Upon termination, LexyFlow deletes or returns all Personal Data
        within 30 days, except where retention is required by law
        (e.g. tax records). Source documents are already deleted within
        seconds of audit completion.
      </p>

      <h2>13. Liability</h2>
      <p>
        Each party&apos;s liability under this DPA is subject to the
        liability cap in the Terms of Service.
      </p>

      <h2>14. Annex — Technical and Organisational Measures</h2>
      <p>
        The TOMs implementing GDPR Art. 32 are described in Section 7
        above and detailed further on request.
      </p>

      <p className="text-sm text-muted-foreground">
        Locale viewed: <code>{locale}</code>. Authoritative version: English.
      </p>
    </LegalShell>
  );
}
