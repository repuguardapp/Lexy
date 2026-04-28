import { unstable_setRequestLocale } from 'next-intl/server';
import { LegalShell } from '@/components/LegalShell';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/terms');
  return {
    title: 'Terms of Service — LexyFlow',
    alternates: { canonical: `/${params.locale}/terms`, languages: alternates }
  };
}

export default async function TermsPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  return (
    <LegalShell title="Terms of Service" effective="January 1, 2026">
      <p>
        These Terms govern your use of LexyFlow (lexyflow.com). By creating
        an account or running an audit you accept them.
      </p>

      <h2>1. Service</h2>
      <p>
        LexyFlow analyses documents you submit against named regulatory
        frameworks (GDPR, EU AI Act, LGPD, APPI and others) and produces
        an AI-authored compliance report. The report is decision-support;
        it is <strong>not legal advice</strong> and does not create an
        attorney-client relationship.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You sign in via magic link to an email you control.</li>
        <li>You are responsible for any activity on your account.</li>
        <li>One person, one account. Sharing magic links is prohibited.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>upload material you do not have the right to process;</li>
        <li>upload personal data of natural persons in volumes you cannot lawfully justify;</li>
        <li>attempt to extract, replicate or reverse-engineer the underlying models;</li>
        <li>circumvent rate limits or access controls;</li>
        <li>use LexyFlow to enable or facilitate unlawful processing.</li>
      </ul>

      <h2>4. Subscriptions and billing</h2>
      <ul>
        <li>Subscriptions are billed monthly in advance via Stripe.</li>
        <li>Prices are shown in your local currency at checkout; tax is added per Stripe Tax.</li>
        <li>You may cancel anytime; cancellation takes effect at the end of the current billing period.</li>
        <li>Refunds are at our discretion outside statutory consumer-protection windows.</li>
      </ul>

      <h2>5. Intellectual property</h2>
      <p>
        We retain all rights to LexyFlow itself. You retain ownership of
        the documents you upload and of the audit reports we generate for
        you. We claim no licence beyond what is strictly necessary to run
        the audit and store the resulting report.
      </p>

      <h2>6. Confidentiality</h2>
      <p>
        Your audit reports and account data are confidential. We will not
        disclose them except (i) to you, (ii) to sub-processors listed in
        the Privacy Policy as needed to operate the service, or (iii) when
        compelled by lawful request.
      </p>

      <h2>7. Disclaimer of warranties</h2>
      <p>
        LexyFlow is provided &ldquo;as is&rdquo;. AI output may contain
        errors, omissions or hallucinations. You agree to review reports
        before acting on them. To the maximum extent permitted by law, we
        disclaim all implied warranties.
      </p>

      <h2>8. Liability</h2>
      <p>
        Our aggregate liability under or in connection with these Terms,
        whether in contract, tort or otherwise, will not exceed the total
        amount you paid us in the 12 months preceding the event giving
        rise to the claim. We are not liable for indirect, incidental,
        consequential or special damages.
      </p>
      <p>
        Nothing in these Terms excludes liability that cannot be excluded
        under applicable law (e.g. for fraud, gross negligence, death or
        personal injury).
      </p>

      <h2>9. Termination</h2>
      <p>
        Either party may terminate at any time. We may suspend immediately
        in case of material breach (notably section 3). Sections 5–10
        survive termination.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by French law. Disputes go to the courts
        of Paris, without prejudice to any mandatory consumer-protection
        forum.
      </p>

      <p className="text-sm text-muted-foreground">
        Locale viewed: <code>{locale}</code>. The authoritative version is
        in English; translations are convenience only.
      </p>
    </LegalShell>
  );
}
