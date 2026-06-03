import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  weightKg: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { weightKg, date } = parsed.data;

  const entry = await prisma.bodyWeight.upsert({
    where: { userId_date: { userId: 1, date: new Date(date) } },
    update: { weightKg },
    create: { userId: 1, weightKg, date: new Date(date) },
  });

  return NextResponse.json({ entry });
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.bodyWeight.findMany({
    where: { userId: 1 },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ entries });
}
