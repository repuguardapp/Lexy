'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  auditId: string;
  locale: string;
  labels: {
    cta: string;
    confirm: string;
    deleting: string;
    success: string;
    failed: string;
  };
}

/**
 * Hard-delete the audit and download the signed receipt.
 *
 * Two-step UX: first click flips into a confirmation state ("Click
 * again to confirm"), second click hits DELETE. The receipt is
 * downloaded as JSON so the customer can keep it for compliance —
 * matches the deletion_log row we keep server-side.
 */
export function DeleteAuditButton({ auditId, locale, labels }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'confirming' | 'deleting' | 'failed'>('idle');

  async function actuallyDelete() {
    setStage('deleting');
    try {
      const res = await fetch(`/api/audit/${auditId}`, { method: 'DELETE' });
      if (!res.ok) {
        setStage('failed');
        return;
      }
      const body = (await res.json().catch(() => null)) as { receipt?: unknown } | null;
      if (body?.receipt) {
        const blob = new Blob([JSON.stringify(body.receipt, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lexyflow-deletion-receipt-${auditId.slice(0, 8)}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setStage('failed');
    }
  }

  if (stage === 'deleting') {
    return (
      <Button variant="destructive" size="sm" disabled>
        <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
        {labels.deleting}
      </Button>
    );
  }

  if (stage === 'confirming') {
    return (
      <div className="flex items-center gap-2">
        <Button variant="destructive" size="sm" onClick={actuallyDelete}>
          <Trash2 className="me-2 h-4 w-4" aria-hidden />
          {labels.confirm}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setStage('idle')}>
          ×
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setStage('confirming')}
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="me-2 h-4 w-4" aria-hidden />
      {stage === 'failed' ? labels.failed : labels.cta}
    </Button>
  );
}
