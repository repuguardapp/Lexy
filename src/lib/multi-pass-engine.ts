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
  findings: z.array(FindingSchema)
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
  lines.push(
    '',
    'Submit your findings via the submit_audit tool. The tool input schema',
    'is the structured form of your audit; the tool is the only way to',
    'return findings.',
    '',
    'Rules:',
    '- Write in English. Translation is performed in a later pass.',
    '- Never invent quotes. Every "evidence" must be verbatim from the doc.',
    '- Citations stay in the original language of the regulation.'
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
    max_tokens: 4096,
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
  return parsed.data;
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
