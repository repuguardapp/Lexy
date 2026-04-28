'use client';

import { CheckCircle2, Mail } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  locale: string;
}

export function SignInForm({ locale }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.get('email'),
          locale
        })
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="grid gap-3 rounded-md border bg-muted/40 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
        <div className="font-medium">Check your inbox</div>
        <p className="text-sm text-muted-foreground">
          If your email is registered (or new), we just sent a sign-in link.
          The link is valid for 60 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        <Mail className="me-2 h-4 w-4" />
        {submitting ? 'Sending…' : 'Email me a magic link'}
      </Button>
    </form>
  );
}
