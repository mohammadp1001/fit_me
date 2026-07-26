import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Muscle } from "@prisma/client";

// Second write path into the shared exercise library. It validates against the
// same canonical vocabulary as the YAML parser so muscles cannot enter the
// library through this door untyped.
const MuscleSchema = z.nativeEnum(Muscle);

const updateSchema = z.object({
  nameEn: z.string().optional(),
  musclesPrimary: z.array(MuscleSchema).min(1).optional(),
  musclesSecondary: z.array(MuscleSchema).optional(),
  descriptionFa: z.string().optional(),
  descriptionEn: z.string().optional(),
  tipsFa: z.array(z.string()).optional(),
  tipsEn: z.array(z.string()).optional(),
  mistakesFa: z.array(z.string()).optional(),
  mistakesEn: z.array(z.string()).optional(),
  wikiUrl: z.string().optional(),
  videoUrl: z.string().optional(),
}).refine(
  ({ musclesPrimary, musclesSecondary }) =>
    !musclesPrimary ||
    !musclesSecondary ||
    !musclesSecondary.some((m) => musclesPrimary.includes(m)),
  { message: "A muscle cannot be both primary and secondary." }
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const exercise = await prisma.exercise.update({
    where: { id: parseInt(id) },
    data: parsed.data,
  });

  return NextResponse.json({ exercise });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const exercise = await prisma.exercise.findUnique({
    where: { id: parseInt(id) },
  });

  if (!exercise) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ exercise });
}
