import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import {
  exerciseIdForSlot,
  listActiveProgramLogs,
  listExerciseHistory,
  listLogsForExercise,
  upsertLog,
} from "@/lib/db/logs";
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

  // The client still posts the program slot it was logged from - that is what
  // the UI has to hand. The log is keyed on the *exercise* it trains, so that
  // it outlives the program.
  const exerciseId = await exerciseIdForSlot(programExerciseId);
  if (exerciseId === null) {
    return NextResponse.json(
      { error: "Unknown programExerciseId" },
      { status: 400 }
    );
  }

  const log = await upsertLog(await currentUserId(), {
    exerciseId,
    programExerciseId,
    date: new Date(date),
    sets,
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
  const userId = await currentUserId();

  // `programExerciseId` is accepted for the exercise-detail history list, but
  // it is resolved to the exercise and answered from the full history. Asking
  // by program slot would show only sets logged since the last upload, because
  // every upload mints fresh slots - the history is the user's, not the
  // program's.
  if (programExerciseId) {
    const id = await exerciseIdForSlot(parseInt(programExerciseId));
    if (id === null) return NextResponse.json({ logs: [] });

    const logs = await listLogsForExercise(userId, id);
    return NextResponse.json({ logs });
  }

  if (exerciseId) {
    // Progress chart: the whole history for one exercise, across every program
    // it has ever appeared in, including programs since deleted.
    const logs = await listExerciseHistory(userId, parseInt(exerciseId));
    return NextResponse.json({ logs });
  }

  // The log overview stays scoped to the active program: it is a view of what
  // you are training now, not an archive.
  const logs = await listActiveProgramLogs(userId);

  return NextResponse.json({ logs });
}
