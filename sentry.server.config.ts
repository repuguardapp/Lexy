import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,

    beforeSend: scrubPII,
    beforeBreadcrumb: scrubBreadcrumb
  });
}

function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Documents in /api/audit are uploaded as multipart bodies. Never let
  // their bytes flow to Sentry.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['stripe-signature'];
      delete event.request.headers['x-api-key'];
    }
  }
  // Strip query strings that might carry tokens.
  if (event.request?.query_string && typeof event.request.query_string === 'string') {
    event.request.query_string = event.request.query_string.replace(
      /(token_hash|code|access_token|refresh_token)=[^&]+/gi,
      '$1=REDACTED'
    );
  }
  return event;
}

function scrubBreadcrumb(crumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (crumb.category === 'http' || crumb.category === 'fetch') {
    if (crumb.data) {
      delete crumb.data['body'];
      delete crumb.data['Authorization'];
    }
  }
  return crumb;
}
