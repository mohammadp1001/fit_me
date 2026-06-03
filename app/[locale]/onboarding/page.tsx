import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import OnboardingForm from "@/components/OnboardingForm";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(await isAuthenticated())) {
    redirect(`/${locale}/login`);
  }

  return <OnboardingForm locale={locale} />;
}
