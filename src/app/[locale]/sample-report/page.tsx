import { ArrowLeft, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildHreflangAlternates } from '@/lib/hreflang';

interface PageProps {
  params: { locale: string };
}

export async function generateMetadata({ params }: PageProps) {
  unstable_setRequestLocale(params.locale);
  const alternates = await buildHreflangAlternates('/sample-report');
  return {
    title: 'Sample audit report — LexyFlow',
    alternates: { canonical: `/${params.locale}/sample-report`, languages: alternates }
  };
}

interface SampleFinding {
  severity: 'critical' | 'high' | 'medium';
  framework: string;
  title: string;
  body: string;
  recommendation: string;
}

interface SampleFixture {
  orgName: string;
  riskScore: number;
  seconds: number;
  frameworkCount: number;
  findings: SampleFinding[];
}

/**
 * Locale-aware sample reports. The Arabic version is a Qatar PDPPL
 * walkthrough — that's the report a Riyadh / Doha compliance officer
 * needs to see when they land on /ar/sample-report from the Gulf
 * launch campaign. Every other locale gets the original multi-framework
 * GDPR+AI Act+LGPD mix, which is the right pitch for Europe / LATAM.
 *
 * Why hand-curated fixtures rather than localising one source: the
 * findings double as marketing copy. The Qatar example uses Doha-shaped
 * scenarios (QNTC opt-in, Article 17, QAR sanctions) that wouldn't
 * land translated from a GDPR template.
 */
function getFixture(locale: string): SampleFixture {
  if (locale === 'ar') {
    return {
      orgName: 'هيئة قطر الوطنية للسياحة (QNTC)',
      riskScore: 75,
      seconds: 47,
      frameworkCount: 1,
      findings: [
        {
          severity: 'critical',
          framework: 'Qatar PDPPL Art. 17',
          title: 'آلية الاشتراك في التسويق غير موصوفة؛ إجراء الانسحاب غائب',
          body: 'تتطلب المادة 17 من قانون حماية خصوصية البيانات الشخصية موافقة صريحة ومسبقة (opt-in) لأي اتصال تسويقي مباشر، مع جعل الانسحاب سهلاً ومجانياً. يكتفي الإشعار بالإشارة إلى وجود "سياسة اشتراك" دون وصف الآلية الفعلية، ولا يُتيح قناة انسحاب موثّقة (رابط، بريد، نموذج).',
          recommendation: 'وصف آلية الاشتراك بشكل صريح (مربع اختيار غير مُحدَّد مسبقاً)، وإضافة قناة انسحاب فورية مجانية (مثل privacy@visitqatar.com)، مع ضمان أن يكون الانسحاب سهلاً مثل الاشتراك. الفشل في المعالجة يعرّض الجهة لغرامات تصل إلى 5,000,000 ﷼ قطري بموجب المواد 22-25.'
        },
        {
          severity: 'high',
          framework: 'Qatar PDPPL Art. 13',
          title: 'بيانات القاصرين دون موافقة وَلي قابلة للتحقق',
          body: 'يجمع النموذج تاريخ الميلاد للضيوف دون مرشّح عمري وبدون أي تدفّق للحصول على موافقة الوالد/الوصي للأطفال دون 18 سنة، خلافاً لمتطلّبات المادة 13 الخاصة بحماية بيانات القاصرين.',
          recommendation: 'إضافة بوابة عمرية في النموذج، وإطلاق تدفّق موافقة الوالد عبر بريد إلكتروني موثَّق عند اكتشاف قاصر. تطبيق مبدأ تقليل البيانات: عدم جمع تفضيلات سلوكية أو إعلانات موجَّهة على بيانات القاصرين.'
        },
        {
          severity: 'medium',
          framework: 'Qatar PDPPL Art. 6',
          title: 'فترة الاحتفاظ غير محدّدة لسجلات الحجوزات',
          body: 'يلتزم الإشعار بحفظ بيانات الحجز "للمدة اللازمة" دون تحديد مدة أو معيار موضوعي. المادة 6 تتطلّب الحدّ من الاحتفاظ بالبيانات إلى ما هو ضروري للغرض المعلَن.',
          recommendation: 'استبدال الصياغة بمدة ملموسة (مثل 36 شهراً بعد آخر تفاعل) أو معيار واضح (حتى إلغاء الحساب). توثيق نفس المدة في سجلّ المعالجة الداخلي.'
        }
      ]
    };
  }

  return {
    orgName: 'Acme Inc.',
    riskScore: 68,
    seconds: 47,
    frameworkCount: 3,
    findings: [
      {
        severity: 'critical',
        framework: 'GDPR Art. 13(2)(a)',
        title: 'Retention period not specified for marketing data',
        body: 'The privacy policy commits to keeping prospect data "as long as necessary" without an objective duration or criterion. Article 13(2)(a) requires the controller to inform the data subject of the period for which the personal data will be stored, or, if not possible, the criteria used to determine that period.',
        recommendation: 'Replace the wording with a concrete duration (e.g. "36 months from last interaction") or a criterion ("until you unsubscribe"). Document the same in the Article 30 register.'
      },
      {
        severity: 'high',
        framework: 'EU AI Act Art. 52(1)',
        title: 'No transparency notice for AI-generated content',
        body: 'The product page mentions "AI-assisted recommendations" without disclosing that the output is machine-generated. From August 2026, deployers of generative AI systems must inform users that they are interacting with AI.',
        recommendation: 'Add a discreet but visible "AI-generated content" label on every AI-produced surface (recommendations, summaries, drafts).'
      },
      {
        severity: 'medium',
        framework: 'LGPD Art. 9',
        title: 'Consent legal basis is bundled with terms acceptance',
        body: 'The Brazilian onboarding flow asks the user to accept the Terms of Service and consent to data processing in a single checkbox. LGPD Art. 9 requires consent to be free, informed and unambiguous, which precludes bundling.',
        recommendation: 'Split the checkbox into two: one for ToS, one for explicit consent on data processing. Log the timestamp and IP for each independently.'
      }
    ]
  };
}

export default async function SampleReportPage({ params: { locale } }: PageProps) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('sampleReport');
  const tReport = await getTranslations('report');
  const fixture = getFixture(locale);

  return (
    <div className="mx-auto max-w-3xl py-16">
      <Button asChild variant="ghost" size="sm" className="-ms-3">
        <Link href="/">
          <ArrowLeft className="me-2 h-4 w-4 rtl:-scale-x-100" />
          {t('back')}
        </Link>
      </Button>

      <header className="mt-6 grid gap-3">
        <Badge variant="outline" className="w-fit">{t('badge')}</Badge>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          {t('title', { org: fixture.orgName })}
        </h1>
        <p className="text-pretty text-muted-foreground">
          {t('subtitle', {
            seconds: fixture.seconds,
            count: fixture.frameworkCount,
            score: fixture.riskScore
          })}
        </p>
      </header>

      <section className="mt-10 grid gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('findings')}
        </h2>
        {fixture.findings.map((f, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <SeverityIcon severity={f.severity} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={f.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {tReport(`severity.${f.severity}`)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{f.framework}</span>
                  </div>
                  <CardTitle className="text-base leading-tight">{f.title}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <CardDescription className="text-pretty">{f.body}</CardDescription>
              <div className="rounded-md border bg-muted/50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('recommendation')}
                </div>
                <p className="mt-1 text-pretty">{f.recommendation}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-12 rounded-lg border bg-muted/40 p-6 text-center">
        <p className="text-pretty">{t('footerBody')}</p>
        <Button asChild size="lg" className="mt-4">
          <Link href="/audit">{t('footerCta')}</Link>
        </Button>
      </section>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: 'critical' | 'high' | 'medium' }) {
  if (severity === 'critical') return <AlertTriangle className="mt-1 h-5 w-5 text-destructive" />;
  if (severity === 'high')     return <FileWarning className="mt-1 h-5 w-5 text-orange-500" />;
  return <CheckCircle2 className="mt-1 h-5 w-5 text-muted-foreground" />;
}
