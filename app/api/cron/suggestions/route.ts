import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateSuggestion,
  MockCoachProvider,
  type CoachProvider,
} from "@/lib/coach";
import { computeGroupVolume } from "@/lib/volume-server";
import { groupsForExercise, toLoggedSets } from "@/lib/volume";
import { verdictForVolume } from "@/lib/muscles";

/**
 * Result for a single exercise processed by the cron run.
 */
type ExerciseResult =
  | { exerciseId: number; status: "created" }
  | { exerciseId: number; status: "skipped" }
  | { exerciseId: number; status: "failed"; error: string };

export interface CronSuggestionsResult {
  dueDay: number | null;
  results: ExerciseResult[];
}

/** Returns today's date truncated to a day-only `Date` (matches `@db.Date` columns). */
function todayDateOnly(): Date {
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  return new Date(isoDate);
}

/**
 * Infers the "due day" (`ProgramDay.dayNumber`) for `program`: the day after
 * the most recently logged day, wrapping to 1 after the last day. A day
 * counts as logged as soon as any of its exercises has a `WorkoutLog` entry
 * on the most recent logged date. Defaults to day 1 when there is no logged
 * history yet for this program.
 */
async function inferDueDay(programId: number): Promise<number | null> {
  const totalDays = await prisma.programDay.count({ where: { programId } });
  if (totalDays === 0) {
    return null;
  }

  const lastLog = await prisma.workoutLog.findFirst({
    where: { programExercise: { day: { programId } } },
    // Break ties on the same calendar date by which log was written most
    // recently, so same-day multi-exercise sessions resolve deterministically.
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { programExercise: { include: { day: true } } },
  });

  if (!lastLog) {
    return 1;
  }

  const lastDayNumber = lastLog.programExercise.day.dayNumber;
  return lastDayNumber >= totalDays ? 1 : lastDayNumber + 1;
}

/**
 * Core cron logic, separated from the HTTP handler so tests can inject a
 * fake `CoachProvider` and inspect the structured result directly.
 */
export async function runSuggestionsCron(
  provider: CoachProvider = new MockCoachProvider(),
): Promise<CronSuggestionsResult> {
  const activeProgram = await prisma.program.findFirst({
    where: { isActive: true },
  });

  if (!activeProgram) {
    return { dueDay: null, results: [] };
  }

  const dueDay = await inferDueDay(activeProgram.id);
  if (dueDay === null) {
    return { dueDay: null, results: [] };
  }

  const dueProgramDay = await prisma.programDay.findFirst({
    where: { programId: activeProgram.id, dayNumber: dueDay },
    include: {
      exercises: { include: { exercise: true } },
    },
  });

  if (!dueProgramDay) {
    return { dueDay, results: [] };
  }

  const today = todayDateOnly();
  const globalMemoryRow = await prisma.globalMemory.findUnique({ where: { id: 1 } });
  const globalMemory = globalMemoryRow?.notes ?? null;

  // Computed once for the whole run: the window is the same for every exercise,
  // and each prompt slices out only the groups its own exercise trains.
  const volume = await computeGroupVolume();

  const results: ExerciseResult[] = [];

  for (const programExercise of dueProgramDay.exercises) {
    const { exercise } = programExercise;

    const existingSuggestion = await prisma.suggestion.findUnique({
      where: {
        exerciseId_date: { exerciseId: exercise.id, date: today },
      },
    });
    if (existingSuggestion) {
      results.push({ exerciseId: exercise.id, status: "skipped" });
      continue;
    }

    try {
      // Cross-program history for this exercise (same pattern as the
      // `exerciseId` branch in app/api/logs/route.ts).
      const history = await prisma.workoutLog.findMany({
        where: {
          userId: 1,
          programExercise: { exerciseId: exercise.id },
        },
        orderBy: { date: "asc" },
      });

      const exerciseMemoryRow = await prisma.exerciseMemory.findUnique({
        where: { exerciseId: exercise.id },
      });

      const output = await generateSuggestion(
        {
          exercise,
          programExercise: {
            id: programExercise.id,
            exerciseId: programExercise.exerciseId,
            setsCount: programExercise.setsCount,
            reps: programExercise.reps,
          },
          history: history.map((log) => ({
            id: log.id,
            programExerciseId: log.programExerciseId,
            date: log.date,
            sets: toLoggedSets(log.sets),
          })),
          exerciseMemory: exerciseMemoryRow?.notes ?? null,
          globalMemory,
          groupVolume: groupsForExercise(
            exercise.musclesPrimary,
            exercise.musclesSecondary
          ).map((group) => ({
            group,
            sets: volume[group],
            verdict: verdictForVolume(volume[group]),
          })),
        },
        provider,
      );

      await prisma.suggestion.create({
        data: {
          exerciseId: exercise.id,
          programExerciseId: programExercise.id,
          date: today,
          sets: output.sets,
          rationale: output.rationale,
        },
      });

      await prisma.exerciseMemory.upsert({
        where: { exerciseId: exercise.id },
        update: { notes: output.updatedExerciseMemory },
        create: { exerciseId: exercise.id, notes: output.updatedExerciseMemory },
      });

      await prisma.globalMemory.upsert({
        where: { id: 1 },
        update: { notes: output.updatedGlobalMemory },
        create: { id: 1, notes: output.updatedGlobalMemory },
      });

      results.push({ exerciseId: exercise.id, status: "created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ exerciseId: exercise.id, status: "failed", error: message });
    }
  }

  return { dueDay, results };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSuggestionsCron();

  return NextResponse.json(result);
}
