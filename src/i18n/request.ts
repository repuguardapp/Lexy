import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, getLocaleDescriptor } from './locales';
import { discoverLocales } from './locales.server';

/**
 * next-intl server config.
 * Loads `messages/<locale>.json` if it exists, otherwise transparently falls
 * back to the default locale dictionary so a partially-translated language
 * never breaks the UI mid-render.
 */
export default getRequestConfig(async ({ locale }) => {
  const requested = (locale ?? DEFAULT_LOCALE).toLowerCase();
  const available = await discoverLocales();
  const resolved = available.includes(requested) ? requested : DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${resolved}.json`)).default;
  const descriptor = getLocaleDescriptor(resolved);

  return {
    locale: resolved,
    messages,
    timeZone: 'UTC',
    now: new Date(),
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' }
      }
    },
    onError(error) {
      // Missing keys must not crash a paid audit — log and let next-intl
      // render the key as fallback text.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[i18n]', descriptor.code, error.message);
      }
    },
    getMessageFallback({ key }) {
      return key;
    }
  };
});
