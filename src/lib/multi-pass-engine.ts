import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ANTHROPIC_MODEL, anthropic, OPENAI_MODEL, openai } from './ai-clients';
import { frameworkById, type FrameworkId } from './legal-frameworks';
import type { AuditFinding, AuditReport, Severity } from '@/types/audit';

/**
 * The Multi-Pass engine is intentionally split into:
 *   Pass 1 — legalAudit():     analyse the document in a canonical pivot
 *                              language (English) for stable, citation-rich
 *                              JSON. Anthropic Claude is the primary model
 *                              because of its long-context handling on
 *                              regulatory text.
 *   Pass 2 — localizeReport(): translate the pass-1 result into the user's
 *                              chosen target language (any BCP-47 tag).
 *                              OpenAI GPT-4o is used here for breadth of
 *                              language coverage and structured outputs.
 *
 * Splitting the passes lets us:
 *   • cache the (expensive) audit pass per documentHash and re-localize on
 *     demand for the marginal cost of a translation call;
 *   • keep legal citations verbatim across languages (we do not translate
 *     citation strings or evidence quotes);
 *   • deliver reports in languages we do not staff for, without polluting
 *     the UI dictionary set.
 */

const FindingSchema = z.object({
  framework: z.string(),
  citation: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  body: z.string(),
  recommendation: z.string(),
  evidence: z.string()
});

const AuditPassSchema = z.object({
  summary: z.string(),
  riskScore: z.number().min(0).max(100),
  // Anthropic's tool-use schema-conformance is best-effort, not strict.
  // For a fully compliant document Claude sometimes omits `findings`
  // entirely instead of returning []. Default to an empty array so a
  // clean audit lands as a successful "0 findings" report rather than
  // a Zod validation failure.
  findings: z.array(FindingSchema).default([])
});

type AuditPassResult = z.infer<typeof AuditPassSchema>;

export interface AuditInput {
  /** Plain-text content already extracted from the uploaded file. */
  documentText: string;
  frameworks: FrameworkId[];
  /** BCP-47 tag of the desired output report. */
  targetLanguage: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/* ------------------------------------------------------------------ */
/* Pass 1 — legal audit in English (canonical pivot)                  */
/* ------------------------------------------------------------------ */

/**
 * Per-framework guidance injected into the system prompt. Only
 * frameworks with non-obvious specificities the base prompt would
 * miss live here — vanilla GDPR-style rules don't need a block.
 *
 * Why bullet form: the model treats each bullet as an independent
 * "must check" rule. Paragraphs get summarised; bullets get scanned.
 */
const FRAMEWORK_GUIDANCE: Partial<Record<FrameworkId, readonly string[]>> = {
  qatar_pdppl: [
    'Qatar PDPPL (Law No. 13 of 2016) — apply the following rules with extra scrutiny:',
    '  * MARKETING CONSENT: Article 17 mandates a strict opt-in for any direct',
    '    marketing communication (email, SMS, calls, push). Pre-ticked boxes,',
    '    "negative-option" wording, bundled consent with ToS acceptance, or any',
    '    form of implicit/inferred consent are NON-COMPLIANT — flag as critical.',
    '    Withdrawal must be as easy as opt-in and free of charge.',
    '  * MINORS DATA: Personal data of individuals under 18 requires verifiable',
    '    parental/guardian consent before any processing. Absence of an age-gate,',
    '    of a parental consent flow, or of stricter safeguards (data minimisation,',
    '    no profiling, no behavioural advertising) → flag as high or critical.',
    '  * SANCTIONS: Non-compliance exposes the controller to administrative fines',
    '    up to QAR 5,000,000 (≈ USD 1.37M) under Articles 22-25, with possible',
    '    daily-accruing penalties and operational suspension by the NCSA. In the',
    '    "recommendation" field, when a finding is severity=critical, cite this',
    '    financial exposure explicitly to convey business urgency.'
  ],
  saudi_pdpl: [
    'Saudi PDPL (Royal Decree M/19, amended 2023) — Kingdom-specific rules:',
    '  * EXPLICIT CONSENT + PURPOSE LIMITATION: Articles 5-6 require explicit',
    '    written or electronic consent per purpose. Bundling consents or vague',
    '    purposes ("to improve our services") are non-compliant — flag as high.',
    '  * CROSS-BORDER TRANSFERS: Article 29 restricts transfers outside KSA',
    '    unless to a country with adequate protection (SDAIA whitelist) OR with',
    '    SDAIA approval. Flag any transfer to a non-adequate jurisdiction as',
    '    critical when no safeguard (SCC equivalent, BCR, derogation) is named.',
    '  * MINORS DATA: parental consent required for data subjects under 18.',
    '  * SANCTIONS: fines up to SAR 5,000,000 (≈ USD 1.33M), doubled for repeat',
    '    offences (max SAR 10M), plus criminal penalties for unlawful disclosure',
    '    of sensitive data (up to 2 years imprisonment). Cite the SAR exposure',
    '    on critical findings.'
  ],
  uae_pdpl: [
    'UAE PDPL (Federal Decree-Law 45/2021) — federal-level rules; DIFC and ADGM',
    'have their own regimes which this audit does not cover unless requested:',
    '  * CONSENT QUALITY: Article 6 requires consent be specific, clear and',
    '    unambiguous, and as easy to withdraw as to give. Implicit/pre-ticked',
    '    consent is non-compliant.',
    '  * MARKETING: Article 13 — direct marketing requires prior opt-in consent;',
    '    every message must include an opt-out mechanism and the controller',
    '    identity. Missing either → flag as high.',
    '  * MINORS: data of individuals under 18 requires guardian consent and',
    '    age-appropriate disclosures.',
    '  * DATA SUBJECT RIGHTS: rights to access, correction, deletion, transfer,',
    '    restriction and objection must be implemented with a 30-day response',
    '    SLA. Absence of a documented response process → flag as high.',
    '  * SANCTIONS: the implementing regulations empower the UAE Data Office to',
    '    impose administrative fines and remedial orders; cite enforcement risk',
    '    in critical findings.'
  ],
  bahrain_pdpl: [
    'Bahrain PDPL (Law No. 30 of 2018) — early-mover Gulf law, GDPR-adjacent:',
    '  * LAWFUL BASIS: Article 4 enumerates the legal bases; "legitimate',
    '    interest" is NOT among them — controllers cannot rely on it. Flag any',
    '    processing justified by legitimate interest as critical.',
    '  * MARKETING: Article 23 mandates prior opt-in for direct marketing and a',
    '    free, accessible opt-out in every communication.',
    '  * MINORS: parental consent required for individuals under 18.',
    '  * SANCTIONS: criminal penalties — up to BHD 20,000 fines AND up to 1',
    '    year imprisonment per Articles 56-61 for serious breaches (sensitive',
    '    data, unlawful cross-border transfer). Cite the criminal exposure in',
    '    critical findings.'
  ],
  kuwait_dppr: [
    'Kuwait DPPR (CITRA Resolution 26/2024) — sectoral telecoms-led regulation',
    'extended to all data controllers:',
    '  * CONSENT: opt-in is mandatory for personal data processing outside the',
    '    legitimate-contract exception. Marketing consent must be separable from',
    '    service consent.',
    '  * DATA LOCALISATION: storage and processing of citizens\' personal data',
    '    should occur in Kuwait by default; cross-border transfer requires CITRA',
    '    notification and adequate safeguards. Flag unsafeguarded transfers as',
    '    critical.',
    '  * MINORS: guardian consent required under 18.',
    '  * SANCTIONS: CITRA may impose administrative fines and licence',
    '    suspension. Cite operational-disruption risk on critical findings.'
  ],
  oman_pdpl: [
    'Oman PDPL (Royal Decree 6/2022) — sultanate-wide regime:',
    '  * PERMIT-BASED PROCESSING: Article 5 — processing sensitive personal',
    '    data (health, biometrics, genetic, race, religion) requires a permit',
    '    from MTCIT. Absence of a permit reference for such processing → flag',
    '    as critical.',
    '  * MARKETING: explicit opt-in only; absence of opt-out mechanism in any',
    '    marketing comm → flag as high.',
    '  * MINORS: under-18 data requires parental consent and minimisation.',
    '  * CROSS-BORDER: transfers outside Oman require subject consent OR an',
    '    adequacy assessment.',
    '  * SANCTIONS: administrative fines up to OMR 500,000 (≈ USD 1.3M) per',
    '    Articles 27-29, with criminal penalties for sensitive-data offences.',
    '    Cite the OMR exposure on critical findings.'
  ]
};

function buildAuditSystemPrompt(frameworks: FrameworkId[]): string {
  const lines = [
    'You are LexyFlow, a senior compliance auditor at a Tier-1 RegTech firm.',
    'Audit the user-supplied document strictly against the named legal',
    'frameworks. Be exhaustive, but only flag concrete, evidenced issues.',
    '',
    'Frameworks in scope:'
  ];
  for (const id of frameworks) {
    const f = frameworkById(id);
    if (!f) continue;
    lines.push(`- ${f.name} (${f.jurisdiction}) — citation style: ${f.citationStyle}`);
  }

  const guidanceBlocks = frameworks
    .map((id) => FRAMEWORK_GUIDANCE[id])
    .filter((b): b is readonly string[] => !!b);
  if (guidanceBlocks.length > 0) {
    lines.push('', 'Framework-specific guidance:');
    for (const block of guidanceBlocks) {
      lines.push(...block);
    }
  }

  lines.push(
    '',
    'Submit your findings via the submit_audit tool. The tool input schema',
    'is the structured form of your audit; the tool is the only way to',
    'return findings.',
    '',
    'Rules:',
    '- Write in English. Translation is performed in a later pass.',
    '- Never invent quotes. Every "evidence" must be verbatim from the doc.',
    '- Citations stay in the original language of the regulation.',
    // Summary↔findings consistency contract — without this, observed
    // failure mode in prod (Qatar PDPPL audit, May 2026): the model
    // wrote a 4-sentence executive summary listing 3 concrete
    // violations and shipped findings: [], leaving the editor with
    // nothing to remediate. The summary is a SYNTHESIS of findings,
    // never a substitute.
    '- The "summary" field is a synthesis of the findings array, not a',
    '  substitute for it. EVERY compliance issue you mention in the',
    '  summary MUST appear as a structured entry in findings[]. If you',
    '  cannot ground an issue in a verbatim evidence quote, do not put',
    '  it in the summary either.',
    '- An empty findings[] is only valid when the document is fully',
    '  compliant. In that case the summary must say so explicitly and',
    '  riskScore must be ≤ 10.',
    '- riskScore must reflect the findings: zero findings → riskScore',
    '  ≤ 10; any critical finding → riskScore ≥ 70; any high finding',
    '  → riskScore ≥ 40.'
  );
  return lines.join('\n');
}

// Tool-use (a.k.a. function calling) is how we force Anthropic to return
// a strict, schema-conformant object. Earlier we asked the model to emit
// raw JSON in a text block — Sonnet 4.6 frequently wrapped it in ```json
// fences, breaking JSON.parse(). Tool use eliminates the parsing surface:
// the API itself validates the input matches input_schema.
const SUBMIT_AUDIT_TOOL = {
  name: 'submit_audit',
  description:
    'Submit the compliance audit. Call this exactly once with the full audit payload.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'Executive summary, 3-5 sentences.'
      },
      riskScore: {
        type: 'number',
        description: '0 (fully compliant) to 100 (severe systemic risk).'
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            framework: { type: 'string', description: 'Framework ID, e.g. "gdpr".' },
            citation: { type: 'string', description: 'e.g. "GDPR Art. 13(2)(a)".' },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'info']
            },
            title: { type: 'string', description: 'Headline of the issue, ≤ 90 chars.' },
            body: { type: 'string', description: '2-4 paragraphs of analysis.' },
            recommendation: { type: 'string', description: 'Concrete remediation steps.' },
            evidence: { type: 'string', description: 'Verbatim quote from the document.' }
          },
          required: ['framework', 'citation', 'severity', 'title', 'body', 'recommendation', 'evidence']
        }
      }
    },
    required: ['summary', 'riskScore', 'findings']
  }
};

export async function legalAudit(input: AuditInput): Promise<AuditPassResult> {
  const system = buildAuditSystemPrompt(input.frameworks);
  const message = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    // 16K is roomy for a thorough multi-finding audit. Sonnet 4.6
    // tops out at 64K so we have headroom; the previous 4K cap was
    // truncating outputs mid-array — Claude would write a confident
    // executive summary mentioning N findings and then run out of
    // budget before populating the findings[] in the tool input.
    // Empirically a 7-finding detailed report is ~3K tokens; 16K
    // covers a 30-finding policy without strain.
    max_tokens: 16384,
    temperature: 0,
    system,
    tools: [SUBMIT_AUDIT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_audit' },
    messages: [{ role: 'user', content: input.documentText }]
  });

  const toolUse = message.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Anthropic did not call submit_audit — stop_reason=' + message.stop_reason);
  }

  // toolUse.input is already a parsed object (Anthropic guarantees JSON
  // schema conformance). We still run it through Zod for runtime safety
  // and to produce the strongly-typed AuditPassResult.
  const parsed = AuditPassSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Audit tool input failed Zod validation: ${parsed.error.message}`);
  }

  // Self-consistency check — Pass 1 sometimes ships a summary that
  // describes specific violations while leaving findings[] empty,
  // producing a report the editor cannot remediate. The prompt now
  // forbids this; the code refuses it. Throwing here lets the
  // outer audit route refund the credit / surface a useful error
  // instead of persisting a misleading "0 findings, 62/100 risk"
  // report. Threshold of 25 is conservative (one medium finding is
  // typically scored 30+); anything cleaner than that we let pass.
  const r = parsed.data;
  if (r.findings.length === 0 && r.riskScore > 25) {
    throw new Error(
      `Pass 1 inconsistency: riskScore=${r.riskScore} with 0 findings. ` +
      `Summary excerpt: "${r.summary.slice(0, 160)}…". ` +
      `Refusing to persist a report that flags risk without listing it.`
    );
  }
  return r;
}

/* ------------------------------------------------------------------ */
/* Pass 2 — dynamic localization                                      */
/* ------------------------------------------------------------------ */

const LocalizedFindingSchema = z.object({
  title: z.string(),
  body: z.string(),
  recommendation: z.string()
});

const LocalizationSchema = z.object({
  summary: z.string(),
  findings: z.array(LocalizedFindingSchema)
});

export async function localizeReport(
  pass1: AuditPassResult,
  targetLanguage: string
): Promise<AuditPassResult> {
  // English pivot can skip pass 2.
  if (targetLanguage.toLowerCase().startsWith('en')) return pass1;

  const payload = {
    summary: pass1.summary,
    findings: pass1.findings.map((f) => ({
      title: f.title,
      body: f.body,
      recommendation: f.recommendation
    }))
  };

  const completion = await openai().chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `You translate compliance audit content into ${targetLanguage} (BCP-47).`,
          'Preserve professional, formal legal register.',
          'Translate ONLY the keys: summary, findings[].title, findings[].body,',
          'findings[].recommendation. Keep array length and order identical.',
          'Do NOT translate citations, framework names, statute numbers, or',
          'evidence quotations — those are passed through unchanged.',
          // RTL targets (Arabic, Hebrew, Persian, Urdu): use Modern Standard
          // register, Latin numerals (1, 2, 3) so article numbers and dates
          // stay legible inside an RTL paragraph, and never emit Unicode
          // bidi control marks (U+202A..U+202E, U+2066..U+2069). Glyph
          // direction is handled by the HTML dir attribute downstream.
          'For Arabic / Hebrew / Persian / Urdu output: use Modern Standard',
          'register, keep numerals in Latin digits, and emit no bidi control',
          'characters.',
          'Return JSON exactly matching the input shape.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify(payload) }
    ]
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty translation');

  const localized = LocalizationSchema.safeParse(JSON.parse(raw));
  if (!localized.success) {
    throw new Error(`Localization pass returned malformed JSON: ${localized.error.message}`);
  }
  if (localized.data.findings.length !== pass1.findings.length) {
    throw new Error('Localization pass changed the number of findings');
  }

  return {
    summary: localized.data.summary,
    riskScore: pass1.riskScore,
    findings: pass1.findings.map((original, i) => {
      const tr = localized.data.findings[i];
      return {
        ...original,
        title: tr?.title ?? original.title,
        body: tr?.body ?? original.body,
        recommendation: tr?.recommendation ?? original.recommendation
      };
    })
  };
}

/* ------------------------------------------------------------------ */
/* Composition                                                        */
/* ------------------------------------------------------------------ */

export async function runMultiPassAudit(input: AuditInput): Promise<AuditReport> {
  const pass1 = await legalAudit(input);
  const pass2 = await localizeReport(pass1, input.targetLanguage);

  const findings: AuditFinding[] = pass2.findings.map((f) => ({
    id: randomUUID(),
    framework: f.framework as FrameworkId,
    citation: f.citation,
    severity: f.severity as Severity,
    title: f.title,
    body: f.body,
    recommendation: f.recommendation,
    evidence: f.evidence
  }));

  return {
    documentHash: sha256(input.documentText),
    frameworks: input.frameworks,
    language: input.targetLanguage,
    generatedAt: new Date().toISOString(),
    summary: pass2.summary,
    riskScore: pass2.riskScore,
    findings
  };
}
