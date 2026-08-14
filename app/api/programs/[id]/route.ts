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
    select: { isActive: true },
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

  // Workout logs are deliberately NOT deleted here. They are the user's
  // training history and outlive the program they happened to be logged
  // under - deleting a program used to destroy them permanently. The
  // `programExerciseId` foreign key is `ON DELETE SET NULL`, so the cascade
  // below simply detaches each log from the slot it was recorded in and
  // leaves `exerciseId`, the durable key, intact.
  try {
    await prisma.program.delete({ where: { id: programId } });
  } catch (e) {
    console.error("[programs/delete] failed:", e);
    return NextResponse.json({ error: "Database error", detail: String(e) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
