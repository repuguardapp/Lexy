import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NATIVE_LOCALE_CODES } from './locales';

const MESSAGES_DIR = path.join(process.cwd(), 'messages');

/**
 * Walk `messages/` and return the codes of every dictionary present.
 * Server-only: imports `node:fs` and `node:path`. Calling this from a
 * client component will produce a build error — that's intentional.
 *
 * Adding `ar.json` to `messages/` ships Arabic to production with no
 * source change.
 */
export async function discoverLocales(): Promise<string[]> {
  try {
    const entries = await fs.readdir(MESSAGES_DIR);
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '').toLowerCase());
  } catch {
    return [...NATIVE_LOCALE_CODES];
  }
}
