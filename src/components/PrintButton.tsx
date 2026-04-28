'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * PDF export = browser print to PDF. Zero deps, works offline, gives the
 * user full control over format. The dashboard detail page declares
 * `print:` Tailwind variants to clean up margins and hide chrome.
 */
export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      <Printer className="me-2 h-4 w-4" aria-hidden />
      Save as PDF
    </Button>
  );
}
