import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Trace 10% of transactions in prod, all of them in dev.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay disabled by default — would otherwise capture form
    // input on /audit which is the very thing we promise not to retain.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Belt-and-braces: scrub anything that smells like PII even if a
    // breadcrumb slips through.
    beforeSend: scrubPII,
    beforeBreadcrumb: scrubBreadcrumb
  });
}

function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Strip request bodies entirely — the audit body is the source document.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
    }
  }
  return event;
}

function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'fetch' || crumb.category === 'xhr') {
    if (crumb.data) {
      delete crumb.data['body'];
      delete crumb.data['Authorization'];
    }
  }
  return crumb;
}
