'use client';

import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Localized idle-state label, e.g. "Gérer la facturation". */
  label: string;
  /** Localized in-flight label, e.g. "Ouverture…". */
  loadingLabel: string;
}

export function ManageBillingButton({ label, loadingLabel }: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setHint(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (res.status === 409) {
        // No active subscription — send the user to pricing instead.
        window.location.assign('../pricing');
        return;
      }
      if (!res.ok) throw new Error(`portal_${res.status}`);
      const { url } = await res.json();
      window.location.assign(url);
    } catch (err) {
      setHint(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1 text-end">
      <Button onClick={go} disabled={busy} variant="outline" size="sm">
        <CreditCard className="me-2 h-4 w-4" aria-hidden />
        {busy ? loadingLabel : label}
      </Button>
      {hint && <span className="text-xs text-destructive">{hint}</span>}
    </div>
  );
}
