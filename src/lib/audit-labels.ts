import type { getTranslations } from 'next-intl/server';
import type { AuditFormLabels } from '@/components/AuditForm';

/**
 * Build the full label bundle that <AuditForm /> consumes from a
 * next-intl translator scoped to the `audit` namespace. Centralising
 * the wiring here means a new key (or a renamed one) only needs to
 * be added in one place even though /audit and /embed/audit both
 * mount the same form.
 *
 * Intentionally typed against the awaited result of `getTranslations`
 * so we capture the exact shape next-intl exposes (`.raw()` is what
 * lets us pull the phases array as-is).
 */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

export function buildAuditFormLabels(t: Translator, errorMessages: Readonly<Record<string, string>>): AuditFormLabels {
  return {
    upload: t('upload'),
    uploadHint: t('uploadHint'),
    targetLanguage: t('targetLanguage'),
    targetLanguageHint: t('targetLanguageHint'),
    framework: t('framework'),
    submit: t('submit'),
    running: t('running'),
    processing: {
      queued: t('processing.queued'),
      running: t('processing.running'),
      phases: t.raw('processing.phases') as readonly string[]
    },
    completed: {
      title: t('completed.title'),
      riskScore: t('completed.riskScore'),
      findingsCount: t('completed.findingsCount'),
      openReport: t('completed.openReport')
    },
    failed: {
      title: t('failed.title'),
      tryAgain: t('failed.tryAgain'),
      timeout: t('failed.timeout')
    },
    errors: errorMessages
  };
}
