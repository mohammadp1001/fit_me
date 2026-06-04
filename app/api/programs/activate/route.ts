import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
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

  // Verify the program belongs to this user
  const program = await prisma.program.findFirst({
    where: { id: programId, userId: 1 },
  });
  if (!program) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Deactivate all, then activate the chosen one
  await prisma.program.updateMany({
    where: { userId: 1 },
    data: { isActive: false },
  });
  await prisma.program.update({
    where: { id: programId },
    data: { isActive: true },
  });

  return NextResponse.json({ ok: true });
}
