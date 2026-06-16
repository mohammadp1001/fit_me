import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const programId = Number(id);
  if (isNaN(programId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Verify the program belongs to this user and is not currently active
  const program = await prisma.program.findFirst({
    where: { id: programId, userId: 1 },
    include: { days: { include: { exercises: { select: { id: true } } } } },
  });

  if (!program) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (program.isActive) {
    return NextResponse.json(
      { error: "Cannot delete the active program. Switch to another program first." },
      { status: 400 }
    );
  }

  // Collect all ProgramExercise ids so we can delete their WorkoutLogs first
  const programExerciseIds = program.days.flatMap((d) =>
    d.exercises.map((e) => e.id)
  );

  // Delete workout logs, then the program (cascade handles days + exercises)
  try {
    if (programExerciseIds.length > 0) {
      await prisma.workoutLog.deleteMany({
        where: { programExerciseId: { in: programExerciseIds } },
      });
    }
    await prisma.program.delete({ where: { id: programId } });
  } catch (e) {
    console.error("[programs/delete] failed:", e);
    return NextResponse.json({ error: "Database error", detail: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
