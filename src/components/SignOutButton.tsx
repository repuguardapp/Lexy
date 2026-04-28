import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Server-rendered logout button. Submits to /api/auth/signout which clears
 * the Supabase session cookies and 303-redirects to the homepage.
 */
export function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="post">
      <Button type="submit" variant="outline" size="sm">
        <LogOut className="me-2 h-4 w-4" aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
