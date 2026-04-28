/**
 * Localized strings for transactional emails.
 *
 * Kept separate from the next-intl dictionaries because:
 *   - emails are server-only (no React tree, no useTranslations);
 *   - we want zero deps to render an email template;
 *   - the keys are stable and small enough to live in code.
 *
 * Every native locale ships a complete strings table. Unknown locales
 * fall back to English.
 */

export type EmailLocale = 'en' | 'fr' | 'es' | 'de' | 'pt-br' | 'ja';

export interface AuditCompletedStrings {
  subject: (severity: string, score: number) => string;
  greeting: (orgName: string) => string;
  heading: string;
  riskScoreLabel: string;
  findingsLabel: string;
  cta: string;
  zeroKnowledgeFooter: string;
  textHeader: string;
}

const MAP: Record<EmailLocale, AuditCompletedStrings> = {
  en: {
    subject: (sev, s) => `Your LexyFlow audit is ready — ${sev} risk (${s}/100)`,
    greeting: (org) => `Hello ${org} — LexyFlow finished analysing the document you uploaded.`,
    heading: 'Your audit is ready.',
    riskScoreLabel: 'Risk score',
    findingsLabel: 'Findings',
    cta: 'Open the report →',
    zeroKnowledgeFooter:
      'Zero-Knowledge: your source document is no longer on our servers. Only this AI-authored report is stored.',
    textHeader: 'Your LexyFlow audit is ready.'
  },
  fr: {
    subject: (sev, s) => `Votre audit LexyFlow est prêt — risque ${sev} (${s}/100)`,
    greeting: (org) => `Bonjour ${org} — LexyFlow a terminé l'analyse de votre document.`,
    heading: 'Votre audit est prêt.',
    riskScoreLabel: 'Score de risque',
    findingsLabel: 'Constatations',
    cta: 'Ouvrir le rapport →',
    zeroKnowledgeFooter:
      "Zero-Knowledge : votre document source n'est plus sur nos serveurs. Seul ce rapport généré par l'IA est conservé.",
    textHeader: 'Votre audit LexyFlow est prêt.'
  },
  es: {
    subject: (sev, s) => `Tu auditoría LexyFlow está lista — riesgo ${sev} (${s}/100)`,
    greeting: (org) => `Hola ${org} — LexyFlow terminó de analizar tu documento.`,
    heading: 'Tu auditoría está lista.',
    riskScoreLabel: 'Puntuación de riesgo',
    findingsLabel: 'Hallazgos',
    cta: 'Abrir el informe →',
    zeroKnowledgeFooter:
      'Zero-Knowledge: tu documento original ya no está en nuestros servidores. Solo se guarda este informe generado por IA.',
    textHeader: 'Tu auditoría LexyFlow está lista.'
  },
  de: {
    subject: (sev, s) => `Ihr LexyFlow-Audit ist bereit — ${sev} Risiko (${s}/100)`,
    greeting: (org) => `Hallo ${org} — LexyFlow hat die Analyse Ihres Dokuments abgeschlossen.`,
    heading: 'Ihr Audit ist bereit.',
    riskScoreLabel: 'Risiko-Score',
    findingsLabel: 'Befunde',
    cta: 'Bericht öffnen →',
    zeroKnowledgeFooter:
      'Zero-Knowledge: Ihr Quelldokument liegt nicht mehr auf unseren Servern. Wir speichern nur diesen KI-erstellten Bericht.',
    textHeader: 'Ihr LexyFlow-Audit ist bereit.'
  },
  'pt-br': {
    subject: (sev, s) => `Sua auditoria LexyFlow está pronta — risco ${sev} (${s}/100)`,
    greeting: (org) => `Olá ${org} — o LexyFlow concluiu a análise do seu documento.`,
    heading: 'Sua auditoria está pronta.',
    riskScoreLabel: 'Pontuação de risco',
    findingsLabel: 'Achados',
    cta: 'Abrir o relatório →',
    zeroKnowledgeFooter:
      'Zero-Knowledge: seu documento original não está mais em nossos servidores. Apenas este relatório gerado por IA é armazenado.',
    textHeader: 'Sua auditoria LexyFlow está pronta.'
  },
  ja: {
    subject: (sev, s) => `LexyFlow 監査が完了しました — リスク ${sev}（${s}/100）`,
    greeting: (org) => `${org} 様 — LexyFlow がドキュメントの分析を完了しました。`,
    heading: '監査が完了しました。',
    riskScoreLabel: 'リスクスコア',
    findingsLabel: '指摘事項',
    cta: 'レポートを開く →',
    zeroKnowledgeFooter:
      'Zero-Knowledge：ソース文書はサーバーに残っていません。保存されるのはこの AI 生成レポートのみです。',
    textHeader: 'LexyFlow 監査が完了しました。'
  }
};

export function emailStringsFor(locale: string | null | undefined): AuditCompletedStrings {
  if (!locale) return MAP.en;
  const lower = locale.toLowerCase() as EmailLocale;
  return MAP[lower] ?? MAP.en;
}
