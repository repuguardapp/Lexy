/**
 * Next.js 14 instrumentation hook. Runs once per runtime at startup.
 * We use it to bootstrap Sentry on the server and edge runtimes; the
 * client runtime is handled by sentry.client.config.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
