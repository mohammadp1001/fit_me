import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parseWorkoutYaml } from "@/lib/yaml-parser";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  yamlContent: z.string().min(1),
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

  const { name, weightKg, heightCm, yamlContent } = parsed.data;

  let program;
  try {
    program = parseWorkoutYaml(yamlContent);
  } catch (e) {
    return NextResponse.json({ error: "Invalid YAML" }, { status: 400 });
  }

  try {
  await prisma.$transaction(async (tx) => {
    // Create or update user (single user, id=1)
    const user = await tx.user.upsert({
      where: { id: 1 },
      update: { name, weightKg, heightCm },
      create: { id: 1, name, weightKg, heightCm },
    });

    // Deactivate existing programs
    await tx.program.updateMany({
      where: { userId: 1, isActive: true },
      data: { isActive: false },
    });

    // Create new program
    const newProgram = await tx.program.create({
      data: {
        userId: 1,
        nameFa: program.name,
        nameEn: program.name_en || program.name,
        yamlContent,
        isActive: true,
        days: {
          create: program.days.map((day, dayIdx) => ({
            dayNumber: dayIdx + 1,
            nameFa: day.name,
            nameEn: day.name_en || day.name,
          })),
        },
      },
      include: { days: true },
    });

    // For each day, create exercises
    for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
      const day = program.days[dayIdx];
      const dbDay = newProgram.days.find((d) => d.dayNumber === dayIdx + 1)!;

      // Group superset exercises
      let supersetGroupCounter = 0;
      const supersetMap = new Map<string, string>();

      for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
        const ex = day.exercises[exIdx];

        // Find or create exercise in library
        let dbExercise = await tx.exercise.findFirst({
          where: { nameFa: ex.name },
        });

        if (!dbExercise) {
          dbExercise = await tx.exercise.create({
            data: {
              nameFa: ex.name,
              nameEn: ex.name,
              muscles: ex.muscles,
              tipsFa: [],
              tipsEn: [],
              mistakesFa: [],
              mistakesEn: [],
            },
          });
        }

        // Determine superset group
        let supersetGroup: string | null = null;
        if (ex.superset_with) {
          const key = [ex.name, ex.superset_with].sort().join("|");
          if (!supersetMap.has(key)) {
            supersetGroupCounter++;
            supersetMap.set(key, `ss_${supersetGroupCounter}`);
          }
          supersetGroup = supersetMap.get(key)!;
        }

        const reps = Array.isArray(ex.reps) ? ex.reps : [ex.reps];

        await tx.programExercise.create({
          data: {
            dayId: dbDay.id,
            exerciseId: dbExercise.id,
            setsCount: ex.sets,
            reps,
            displayOrder: exIdx,
            supersetGroup,
          },
        });
      }
    }
  });
  } catch (e) {
    console.error("[setup] transaction failed:", e);
    return NextResponse.json(
      { error: "Database error", detail: String(e) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
