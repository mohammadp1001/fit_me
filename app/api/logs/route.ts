import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SetSchema = z.object({
  weight: z.number().nullable(),
  reps: z.number().int().nullable(),
});

const LogSchema = z.object({
  programExerciseId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sets: z.array(SetSchema),
});

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { programExerciseId, date, sets } = parsed.data;

  const log = await prisma.workoutLog.upsert({
    where: {
      userId_programExerciseId_date: {
        userId: 1,
        programExerciseId,
        date: new Date(date),
      },
    },
    update: { sets },
    create: {
      userId: 1,
      programExerciseId,
      date: new Date(date),
      sets,
    },
  });

  return NextResponse.json({ log });
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const programExerciseId = searchParams.get("programExerciseId");
  const exerciseId = searchParams.get("exerciseId");

  if (programExerciseId) {
    const logs = await prisma.workoutLog.findMany({
      where: { userId: 1, programExerciseId: parseInt(programExerciseId) },
      orderBy: { date: "desc" },
    });
    return NextResponse.json({ logs });
  }

  if (exerciseId) {
    // Get logs across all program exercises for this exercise (for progress chart)
    const logs = await prisma.workoutLog.findMany({
      where: {
        userId: 1,
        programExercise: { exerciseId: parseInt(exerciseId) },
      },
      orderBy: { date: "asc" },
      include: { programExercise: true },
    });
    return NextResponse.json({ logs });
  }

  // Get all logs grouped by exercise
  const logs = await prisma.workoutLog.findMany({
    where: { userId: 1 },
    orderBy: { date: "desc" },
    include: {
      programExercise: {
        include: { exercise: true, day: true },
      },
    },
  });

  return NextResponse.json({ logs });
}
