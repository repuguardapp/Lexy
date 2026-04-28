import { unstable_setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/OnboardingForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, organizationIdFromUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Welcome to LexyFlow',
  robots: { index: false, follow: false }
};

interface PageProps {
  params: { locale: string };
}

export default async function OnboardingPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/onboarding`);

  // Already onboarded — skip the form, go to dashboard.
  if (organizationIdFromUser(user)) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-balance text-2xl">Welcome to LexyFlow.</CardTitle>
          <CardDescription>
            One-time setup. Tell us about your organisation so we can pick
            the right legal frameworks for your audits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm locale={locale} userEmail={user.email ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
