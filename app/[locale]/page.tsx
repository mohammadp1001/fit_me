import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
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

  const user = await prisma.user.findUnique({ where: { id: 1 } });

  if (!user) {
    redirect(`/${locale}/onboarding`);
  }

  const [program, allPrograms] = await Promise.all([
    prisma.program.findFirst({
      where: { userId: 1, isActive: true },
      include: {
        days: {
          orderBy: { dayNumber: "asc" },
          include: {
            exercises: {
              orderBy: { displayOrder: "asc" },
              include: { exercise: true },
            },
          },
        },
      },
    }),
    prisma.program.findMany({
      where: { userId: 1 },
      orderBy: { id: "desc" },
      select: { id: true, nameFa: true, nameEn: true, startDate: true, isActive: true },
    }),
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
