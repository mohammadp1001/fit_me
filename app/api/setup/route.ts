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
    // Surface the parser's message: it names the day, exercise and offending
    // value, which is the only way a user can fix a rejected muscle tag.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid YAML" },
      { status: 400 }
    );
  }

  try {
    // Create or update user (single user, id=1)
    await prisma.user.upsert({
      where: { id: 1 },
      update: { name, weightKg, heightCm },
      create: { id: 1, name, weightKg, heightCm },
    });

    // Deactivate existing programs
    await prisma.program.updateMany({
      where: { userId: 1, isActive: true },
      data: { isActive: false },
    });

    // Create new program (days created in a nested write — single round-trip)
    const newProgram = await prisma.program.create({
      data: {
        userId: 1,
        nameFa: program.name,
        nameEn: program.name_en ?? program.name,
        yamlContent,
        isActive: true,
        days: {
          create: program.days.map((day, dayIdx) => ({
            dayNumber: dayIdx + 1,
            nameFa: day.name,
            nameEn: day.name_en ?? day.name,
          })),
        },
      },
      include: { days: true },
    });

    // For each day create ProgramExercise rows (outside any transaction)
    let supersetGroupCounter = 0;

    for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
      const day = program.days[dayIdx];
      const dbDay = newProgram.days.find((d) => d.dayNumber === dayIdx + 1)!;
      const supersetMap = new Map<string, string>();

      for (let exIdx = 0; exIdx < day.exercises.length; exIdx++) {
        const ex = day.exercises[exIdx];

        // Find or auto-create the exercise in the library.
        //
        // A YAML `name:` is matched against *either* stored name. Matching
        // `nameFa` alone meant an English-named YAML could never bind to the
        // Persian-named MuscleWiki seed rows, so every upload minted a second
        // library row for the same movement - one upload of the 26-exercise
        // example program took the library from 29 rows to 55 (#45).
        //
        // Order matters and is not cosmetic: `nameFa` is `@unique` and is the
        // canonical key, so it is tried first via `findUnique`. `nameEn` is
        // *not* unique, so its fallback pins `orderBy: id` - without that,
        // which of several same-nameEn rows you get is undefined, and a
        // program could silently rebind to a different row on a later upload.
        let dbExercise = await prisma.exercise.findUnique({
          where: { nameFa: ex.name },
        });

        if (!dbExercise) {
          dbExercise = await prisma.exercise.findFirst({
            where: { nameEn: ex.name },
            orderBy: { id: "asc" },
          });
        }

        if (!dbExercise) {
          dbExercise = await prisma.exercise.create({
            data: {
              nameFa: ex.name,
              nameEn: ex.name,
              musclesPrimary: ex.musclesPrimary,
              musclesSecondary: ex.musclesSecondary,
              videoUrl: ex.video ?? "",
              descriptionFa: ex.description ?? "",
              descriptionEn: ex.description_en ?? ex.description ?? "",
              tipsFa: ex.tips ?? [],
              tipsEn: ex.tips_en ?? ex.tips ?? [],
              mistakesFa: ex.mistakes ?? [],
              mistakesEn: ex.mistakes_en ?? ex.mistakes ?? [],
            },
          });
        } else {
          // Backfill guide *prose* onto an existing library exercise, filling
          // only the fields that are still empty. The backfill rule exists to
          // protect hand-written prose from being blanked by a terser YAML.
          //
          // Muscles and the video URL are the deliberate exceptions: both are
          // overwritten whenever the upload supplies them. Neither is prose.
          // Muscles come from a closed enum where every value is valid, and a
          // video URL is a single pointer that is either right or wrong -
          // there is nothing to protect, and overwriting is the only way a
          // user can ever *correct* a mis-tagged exercise or a stale link.
          //
          // Video specifically: leaving this as backfill-only meant a library
          // row seeded (or created by an earlier upload) with a MuscleWiki
          // `.mp4` silently ignored a newer YAML's `video:` forever, so the
          // Guide-tab link kept pointing at MuscleWiki no matter what the user
          // uploaded. `ex.video` is still guarded - an upload that omits
          // `video:` leaves the stored URL alone rather than blanking it.
          const patch: Record<string, unknown> = {
            musclesPrimary: ex.musclesPrimary,
            musclesSecondary: ex.musclesSecondary,
          };
          const descEn = ex.description_en ?? ex.description;
          const tipsEn = ex.tips_en ?? ex.tips;
          const mistakesEn = ex.mistakes_en ?? ex.mistakes;
          if (ex.video) patch.videoUrl = ex.video;
          if (ex.description && !dbExercise.descriptionFa) patch.descriptionFa = ex.description;
          if (descEn && !dbExercise.descriptionEn) patch.descriptionEn = descEn;
          if (ex.tips?.length && dbExercise.tipsFa.length === 0) patch.tipsFa = ex.tips;
          if (tipsEn?.length && dbExercise.tipsEn.length === 0) patch.tipsEn = tipsEn;
          if (ex.mistakes?.length && dbExercise.mistakesFa.length === 0) patch.mistakesFa = ex.mistakes;
          if (mistakesEn?.length && dbExercise.mistakesEn.length === 0) patch.mistakesEn = mistakesEn;
          if (Object.keys(patch).length > 0) {
            dbExercise = await prisma.exercise.update({
              where: { id: dbExercise.id },
              data: patch,
            });
          }
        }

        // Resolve superset group label
        let supersetGroup: string | null = null;
        if (ex.superset_with) {
          const key = [ex.name, ex.superset_with].sort().join("|");
          if (!supersetMap.has(key)) {
            supersetGroupCounter++;
            supersetMap.set(key, `ss_${supersetGroupCounter}`);
          }
          supersetGroup = supersetMap.get(key)!;
        }

        await prisma.programExercise.create({
          data: {
            dayId: dbDay.id,
            exerciseId: dbExercise.id,
            setsCount: ex.sets,
            reps: Array.isArray(ex.reps) ? ex.reps : [ex.reps],
            displayOrder: exIdx,
            supersetGroup,
          },
        });
      }
    }
  } catch (e) {
    console.error("[setup] failed:", e);
    return NextResponse.json(
      { error: "Database error", detail: String(e) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
