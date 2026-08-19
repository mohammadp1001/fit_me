import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import {
  getSuggestionByExercise,
  getSuggestionBySlot,
} from "@/lib/db/suggestions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const programExerciseId = searchParams.get("programExerciseId");
  const exerciseId = searchParams.get("exerciseId");
  const date = searchParams.get("date");

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const userId = await currentUserId();

  if (programExerciseId) {
    const suggestion = await getSuggestionBySlot(
      userId,
      parseInt(programExerciseId),
      new Date(date)
    );
    return NextResponse.json({ suggestion });
  }

  if (exerciseId) {
    const suggestion = await getSuggestionByExercise(
      userId,
      parseInt(exerciseId),
      new Date(date)
    );
    return NextResponse.json({ suggestion });
  }

  return NextResponse.json(
    { error: "programExerciseId or exerciseId is required" },
    { status: 400 }
  );
}
