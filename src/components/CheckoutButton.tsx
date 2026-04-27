'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  plan: 'starter' | 'pro' | 'enterprise';
  locale: string;
  label: string;
}

export function CheckoutButton({ plan, locale, label }: Props) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          locale,
          organizationId: '00000000-0000-0000-0000-000000000000'
        })
      });
      const data = await res.json();
      if (data.url) window.location.assign(data.url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={go} disabled={busy} className="w-full">
      {label}
    </Button>
  );
}
