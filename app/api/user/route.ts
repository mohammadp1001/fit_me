import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: 1 } });
  return NextResponse.json({ user });
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
});

export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: 1 },
    data: parsed.data,
  });

  return NextResponse.json({ user });
}
