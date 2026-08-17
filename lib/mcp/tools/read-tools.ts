import { prisma } from "@/lib/prisma";
import { parseWorkoutYaml } from "@/lib/yaml-parser";
import { toLoggedSets } from "@/lib/volume";
import { computeGroupVolume } from "@/lib/volume-server";
import {
  MUSCLE_GROUP_LABEL,
  WEEKLY_SET_CEILING,
  WEEKLY_SET_FLOOR,
  verdictForVolume,
} from "@/lib/muscles";
import { summariseExercise, trendPerWeek } from "@/lib/progress";
import { resolveExerciseStrict } from "@/lib/exercise-lookup";

/**
 * The read tools.
 *
 * Plain async functions, deliberately not coupled to the MCP SDK: the logic is
 * tested directly against Postgres, and `lib/mcp/server.ts` only registers
 * them. Every response carries both `nameFa` and `nameEn` so the model never
 * has to guess which language it is looking at.
 *
 * The single user is `id = 1` throughout, matching the rest of the app.
 */

const USER_ID = 1;

/** Caps on anything unbounded, so one call cannot swamp a context window. */
export const LIMITS = {
  exerciseHistory: 200,
  bodyWeight: 400,
  exercises: 500,
} as const;

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Start of the window `weeks` before today, as a day-only Date. */
function windowStart(weeks: number, now: Date): Date {
  const start = new Date(now.toISOString().slice(0, 10));
  start.setUTCDate(start.getUTCDate() - weeks * 7);
  return start;
}

// --- get_progress_summary ---------------------------------------------------

export interface ProgressSummaryOptions {
  weeks?: number;
  now?: Date;
}

/**
 * The headline tool: computed numbers over a trailing window.
 *
 * Deliberately returns no raw sets. `get_exercise_history` exists for the
 * drill-down, and keeping this response dense is what lets a chatbot reason
 * about a whole training block in one call.
 */
export async function getProgressSummary({
  weeks = 8,
  now = new Date(),
}: ProgressSummaryOptions = {}) {
  const from = windowStart(weeks, now);

  const logs = await prisma.workoutLog.findMany({
    where: { userId: USER_ID, date: { gte: from } },
    include: {
      exercise: {
        select: {
          id: true,
          nameFa: true,
          nameEn: true,
          musclesPrimary: true,
          musclesSecondary: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const byExercise = new Map<number, typeof logs>();
  for (const log of logs) {
    // A log whose exercise row is gone cannot be attributed to anything, so it
    // is skipped rather than bucketed under a placeholder.
    if (!log.exercise) continue;
    const bucket = byExercise.get(log.exercise.id) ?? [];
    bucket.push(log);
    byExercise.set(log.exercise.id, bucket);
  }

  const exercises = [...byExercise.values()]
    .map((entries) => {
      const exercise = entries[0].exercise!;
      const summary = summariseExercise(
        entries.map((log) => ({ date: log.date, sets: toLoggedSets(log.sets) })),
      );
      return {
        nameFa: exercise.nameFa,
        nameEn: exercise.nameEn,
        musclesPrimary: exercise.musclesPrimary,
        musclesSecondary: exercise.musclesSecondary,
        ...summary,
      };
    })
    // Most-trained first: that is the order a coach reads them in, and it puts
    // the exercises worth discussing at the top if the list gets long.
    .sort((a, b) => b.hardSets - a.hardSets);

  const bodyWeights = await prisma.bodyWeight.findMany({
    where: { userId: USER_ID, date: { gte: from } },
    orderBy: { date: "asc" },
  });

  const volume = await computeGroupVolume(now);
  const volumeByGroup = Object.entries(volume).map(([group, sets]) => ({
    group,
    labelEn: MUSCLE_GROUP_LABEL[group as keyof typeof MUSCLE_GROUP_LABEL].en,
    labelFa: MUSCLE_GROUP_LABEL[group as keyof typeof MUSCLE_GROUP_LABEL].fa,
    sets,
    verdict: verdictForVolume(sets),
  }));

  return {
    window: { weeks, from: dayString(from), to: dayString(now) },
    bodyWeight: {
      entries: bodyWeights.length,
      startKg: bodyWeights[0]?.weightKg ?? null,
      latestKg: bodyWeights[bodyWeights.length - 1]?.weightKg ?? null,
      trendKgPerWeek: trendPerWeek(
        bodyWeights.map((b) => ({ date: b.date, value: b.weightKg })),
      ),
    },
    // Volume is the trailing 7 days regardless of `weeks`: the 10/20-set
    // landmarks it is judged against are weekly figures, so widening the window
    // would make the verdicts meaningless.
    volume: {
      windowDays: 7,
      landmarks: { low: WEEKLY_SET_FLOOR, high: WEEKLY_SET_CEILING },
      byGroup: volumeByGroup,
    },
    exercises,
  };
}

// --- get_exercise_history ---------------------------------------------------

/**
 * Raw sets for one exercise, newest first.
 *
 * The drill-down behind the summary. `resolveExerciseStrict` is used rather
 * than a lenient lookup: reporting the wrong lift's numbers because two rows
 * share an English name is worse than refusing to answer.
 */
export async function getExerciseHistory({
  name,
  limit = 50,
}: {
  name: string;
  limit?: number;
}) {
  const exercise = await resolveExerciseStrict(name);
  const capped = Math.min(Math.max(1, limit), LIMITS.exerciseHistory);

  const logs = await prisma.workoutLog.findMany({
    where: { userId: USER_ID, exerciseId: exercise.id },
    orderBy: { date: "desc" },
    take: capped,
  });

  return {
    exercise: {
      nameFa: exercise.nameFa,
      nameEn: exercise.nameEn,
      musclesPrimary: exercise.musclesPrimary,
      musclesSecondary: exercise.musclesSecondary,
    },
    limit: capped,
    returned: logs.length,
    sessions: logs.map((log) => ({
      date: dayString(log.date),
      sets: toLoggedSets(log.sets),
    })),
  };
}

// --- get_volume -------------------------------------------------------------

/** Trailing 7-day hard-set volume per muscle group, with the 10/20 verdicts. */
export async function getVolume({ now = new Date() }: { now?: Date } = {}) {
  const volume = await computeGroupVolume(now);

  return {
    windowDays: 7,
    landmarks: { low: WEEKLY_SET_FLOOR, high: WEEKLY_SET_CEILING },
    byGroup: Object.entries(volume).map(([group, sets]) => ({
      group,
      labelEn: MUSCLE_GROUP_LABEL[group as keyof typeof MUSCLE_GROUP_LABEL].en,
      labelFa: MUSCLE_GROUP_LABEL[group as keyof typeof MUSCLE_GROUP_LABEL].fa,
      sets,
      verdict: verdictForVolume(sets),
    })),
  };
}

// --- get_body_weight --------------------------------------------------------

export async function getBodyWeight({
  from,
  to,
  limit = 200,
}: {
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  const capped = Math.min(Math.max(1, limit), LIMITS.bodyWeight);

  const entries = await prisma.bodyWeight.findMany({
    where: {
      userId: USER_ID,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: capped,
  });

  // Query descending to honour the limit against the most recent entries, then
  // present ascending because a trend reads forwards.
  const ascending = [...entries].reverse();

  return {
    returned: ascending.length,
    trendKgPerWeek: trendPerWeek(
      ascending.map((e) => ({ date: e.date, value: e.weightKg })),
    ),
    entries: ascending.map((e) => ({
      date: dayString(e.date),
      weightKg: e.weightKg,
    })),
  };
}

// --- get_coach_memory -------------------------------------------------------

/**
 * The coach's running notes.
 *
 * Read-only in #53. The write side lands with `save_suggestions` in #54; until
 * then these tables hold only whatever the retired mock cron wrote, which is
 * placeholder text.
 */
export async function getCoachMemory({ name }: { name?: string } = {}) {
  const global = await prisma.globalMemory.findUnique({ where: { id: 1 } });

  if (name) {
    const exercise = await resolveExerciseStrict(name);
    const memory = await prisma.exerciseMemory.findUnique({
      where: { exerciseId: exercise.id },
    });

    return {
      global: global?.notes ?? null,
      exercises: [
        {
          nameFa: exercise.nameFa,
          nameEn: exercise.nameEn,
          notes: memory?.notes ?? null,
        },
      ],
    };
  }

  const memories = await prisma.exerciseMemory.findMany({
    include: { exercise: { select: { nameFa: true, nameEn: true } } },
    orderBy: { exerciseId: "asc" },
  });

  return {
    global: global?.notes ?? null,
    exercises: memories.map((m) => ({
      nameFa: m.exercise.nameFa,
      nameEn: m.exercise.nameEn,
      notes: m.notes,
    })),
  };
}

// --- list_programs / get_program --------------------------------------------

export async function listPrograms() {
  const programs = await prisma.program.findMany({
    where: { userId: USER_ID },
    orderBy: { id: "asc" },
    include: { _count: { select: { days: true } } },
  });

  return {
    programs: programs.map((p) => ({
      id: p.id,
      nameFa: p.nameFa,
      nameEn: p.nameEn,
      isActive: p.isActive,
      days: p._count.days,
    })),
  };
}

/** Full structure of one program, defaulting to the active one. */
export async function getProgram({ id }: { id?: number } = {}) {
  const program = await prisma.program.findFirst({
    where: id ? { id, userId: USER_ID } : { userId: USER_ID, isActive: true },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          exercises: {
            orderBy: { displayOrder: "asc" },
            include: {
              exercise: {
                select: {
                  nameFa: true,
                  nameEn: true,
                  musclesPrimary: true,
                  musclesSecondary: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!program) {
    throw new Error(
      id
        ? `No program with id ${id}.`
        : "No active program. Call list_programs to see what exists.",
    );
  }

  return {
    id: program.id,
    nameFa: program.nameFa,
    nameEn: program.nameEn,
    isActive: program.isActive,
    days: program.days.map((day) => ({
      dayNumber: day.dayNumber,
      nameFa: day.nameFa,
      nameEn: day.nameEn,
      exercises: day.exercises.map((slot) => ({
        nameFa: slot.exercise.nameFa,
        nameEn: slot.exercise.nameEn,
        sets: slot.setsCount,
        reps: slot.reps,
        musclesPrimary: slot.exercise.musclesPrimary,
        musclesSecondary: slot.exercise.musclesSecondary,
        // Supersets are stored as a shared group key rather than as a pointer
        // between partners, so two slots in the same day carrying the same
        // non-null value are supersetted together.
        supersetGroup: slot.supersetGroup,
      })),
    })),
  };
}

// --- list_exercises ---------------------------------------------------------

/**
 * The library, so a model can find the exact name to pass to other tools.
 *
 * `resolveExerciseStrict` points here in its error messages, which is what
 * turns a failed lookup into a one-turn correction.
 */
export async function listExercises({
  search,
  limit = 200,
}: {
  search?: string;
  limit?: number;
} = {}) {
  const capped = Math.min(Math.max(1, limit), LIMITS.exercises);

  const exercises = await prisma.exercise.findMany({
    where: search
      ? {
          OR: [
            { nameEn: { contains: search, mode: "insensitive" } },
            { nameFa: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { id: "asc" },
    take: capped,
    select: {
      nameFa: true,
      nameEn: true,
      musclesPrimary: true,
      musclesSecondary: true,
    },
  });

  return { returned: exercises.length, exercises };
}

// --- validate_program_yaml --------------------------------------------------

/**
 * Parses a candidate program YAML and reports what is wrong with it.
 *
 * Parse-only: it runs the exact parser the upload path uses and writes nothing.
 * This is what lets a chatbot check its own draft before handing it over,
 * rather than the user discovering the problem at upload time.
 */
export async function validateProgramYaml({ yaml }: { yaml: string }) {
  try {
    const program = parseWorkoutYaml(yaml);

    return {
      valid: true as const,
      program: {
        nameFa: program.name,
        nameEn: program.name_en ?? program.name,
        days: program.days.map((day) => ({
          nameFa: day.name,
          exercises: day.exercises.length,
        })),
        totalExercises: program.days.reduce((n, d) => n + d.exercises.length, 0),
      },
    };
  } catch (err) {
    return {
      valid: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
