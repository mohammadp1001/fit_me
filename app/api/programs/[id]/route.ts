import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { deleteProgram } from "@/lib/db/programs";

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

  let result;
  try {
    result = await deleteProgram(await currentUserId(), programId);
  } catch (e) {
    console.error("[programs/delete] failed:", e);
    return NextResponse.json({ error: "Database error", detail: String(e) }, { status: 500 });
  }

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Cannot delete the active program. Switch to another program first." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
