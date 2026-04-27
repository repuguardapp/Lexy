import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
};

/**
 * Root layout is intentionally minimal: per-locale layout owns `<html lang>`
 * and `<html dir>` so a single shell handles LTR + RTL without a remount.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
