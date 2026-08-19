import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { getUser } from "@/lib/db/user";
import { getActiveProgram, listPrograms } from "@/lib/db/programs";
import AppShell from "@/components/AppShell";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(await isAuthenticated())) {
    redirect(`/${locale}/login`);
  }

  const userId = await currentUserId();
  const user = await getUser(userId);

  if (!user) {
    redirect(`/${locale}/onboarding`);
  }

  const [program, allPrograms] = await Promise.all([
    getActiveProgram(userId),
    listPrograms(userId),
  ]);

  if (!program) {
    redirect(`/${locale}/onboarding`);
  }

  // Serialize Dates for client components
  const serializedUser = {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  const serializedProgram = {
    ...program,
    startDate: program.startDate.toISOString(),
    days: program.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((pe) => ({
        ...pe,
        reps: pe.reps as number[],
      })),
    })),
  };

  const serializedAllPrograms = allPrograms.map((p) => ({
    ...p,
    startDate: p.startDate.toISOString(),
  }));

  return (
    <AppShell
      locale={locale}
      user={serializedUser}
      program={serializedProgram}
      allPrograms={serializedAllPrograms}
    />
  );
}
