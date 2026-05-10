import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** Localized button label, e.g. "Se déconnecter" / "Sign out". */
  label: string;
}

/**
 * Server-rendered logout button. Submits to /api/auth/signout which clears
 * the Supabase session cookies and 303-redirects to the homepage.
 *
 * Caller is responsible for passing a localized label — the component
 * has no access to next-intl's translator (kept dependency-free so it
 * can be embedded in either a server or client subtree).
 */
export function SignOutButton({ label }: Props) {
  return (
    <form action="/api/auth/signout" method="post">
      <Button type="submit" variant="outline" size="sm">
        <LogOut className="me-2 h-4 w-4" aria-hidden />
        {label}
      </Button>
    </form>
  );
}
