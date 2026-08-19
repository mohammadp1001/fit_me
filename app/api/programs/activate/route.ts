import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { activateProgram, findProgram } from "@/lib/db/programs";
import { z } from "zod";

const schema = z.object({ programId: z.number().int().positive() });

export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { programId } = parsed.data;
  const userId = await currentUserId();

  // Verify the program belongs to this user before touching anything.
  const program = await findProgram(userId, programId);
  if (!program) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await activateProgram(userId, programId);

  return NextResponse.json({ ok: true });
}
