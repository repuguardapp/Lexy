import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  applicationName: 'LexyFlow',
  authors: [{ name: 'LexyFlow', url: 'https://lexyflow.com' }],
  creator: 'LexyFlow',
  publisher: 'LexyFlow',
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'LexyFlow'
  },
  twitter: {
    card: 'summary_large_image',
    site: '@lexyflow_ai'
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#0b0b0d' }
  ],
  width: 'device-width',
  initialScale: 1
};

/**
 * Root layout is intentionally minimal: per-locale layout owns `<html lang>`
 * and `<html dir>` so a single shell handles LTR + RTL without a remount.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
