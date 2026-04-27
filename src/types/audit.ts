import type { FrameworkId } from '@/lib/legal-frameworks';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AuditFinding {
  id: string;
  framework: FrameworkId;
  /** Citation, e.g. "GDPR Art. 6(1)(a)" — kept verbatim across translations. */
  citation: string;
  severity: Severity;
  /** Short headline. Localized in pass 2. */
  title: string;
  /** Long-form analysis. Localized in pass 2. */
  body: string;
  /** Concrete remediation steps. Localized in pass 2. */
  recommendation: string;
  /** Verbatim quotation from the source document — never localized. */
  evidence: string;
}

export interface AuditReport {
  /** Stable hash of the source document (sha-256) — used for idempotency. */
  documentHash: string;
  frameworks: FrameworkId[];
  /** BCP-47 tag of the report. Independent from the UI locale. */
  language: string;
  generatedAt: string;
  summary: string;
  riskScore: number;
  findings: AuditFinding[];
}
