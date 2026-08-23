import yaml from "js-yaml";
import { z } from "zod";

/**
 * The program format.
 *
 * A program says **which exercise, how many sets, what reps** - and nothing
 * else. Anatomy used to live here too, restated on every upload and written
 * straight over the stored exercise, which meant one sloppy or hallucinated
 * file could silently re-tag a lift and corrupt the volume chart. Muscles are a
 * fact about the exercise, so they live in the catalog now.
 *
 * Exercises are addressed by **slug**, not by display name. A model writing
 * YAML produces "Incline DB Press", "Incline Dumbbell Bench Press" and
 * "incline db press" on three different days; a slug is a value it can look up
 * with `list_exercises` and copy exactly. Fuzzy matching was considered and
 * rejected - it is forgiving right until the day it silently matches the wrong
 * exercise and the volume chart is wrong with no error anywhere.
 */
const ExerciseSchema = z
  .object({
    exercise: z
      .string()
      .regex(
        /^[a-z0-9_:]+$/,
        "must be a slug like `barbell_squat` - lowercase, digits and underscores. Call list_exercises to find it.",
      ),
    sets: z.number().int().positive(),
    reps: z.union([
      z.array(z.number().int().positive()),
      z.number().int().positive().transform((n) => [n]),
    ]),
    superset_with: z.string().nullable().optional(),
    /** The coach's reason for this prescription. Shown with the program. */
    note: z.string().optional(),
  })
  .strict();

const DaySchema = z
  .object({
    name: z.string(),
    exercises: z.array(ExerciseSchema),
  })
  .strict();

const ProgramSchema = z
  .object({
    program: z
      .object({
        name: z.string(),
        days: z.array(DaySchema),
      })
      .strict(),
  })
  .strict();

export type ParsedExercise = z.infer<typeof ExerciseSchema>;
export type ParsedDay = z.infer<typeof DaySchema>;
export type ParsedProgram = z.infer<typeof ProgramSchema>["program"];

/**
 * Keys the old format used, with what to do instead.
 *
 * A v1 file is rejected with a specific message rather than a generic schema
 * error: the whole point of removing these keys is that they were silently
 * authoritative, so an author who still sends them deserves to be told exactly
 * why they are gone.
 */
const REMOVED_KEYS: Record<string, string> = {
  muscles:
    "muscles now live in the exercise catalog, not in the program. Remove the block.",
  name: "an exercise is addressed by `exercise: <slug>` now. Call list_exercises to find the slug.",
  description:
    "descriptions live in the exercise catalog. Use `note:` for your reasoning about this prescription.",
  description_en: "descriptions live in the exercise catalog.",
  tips: "tips live in the exercise catalog.",
  tips_en: "tips live in the exercise catalog.",
  mistakes: "common mistakes live in the exercise catalog.",
  mistakes_en: "common mistakes live in the exercise catalog.",
  video: "video links live in the exercise catalog.",
  name_en: "programs and days have a single English `name` now.",
};

function checkRemovedKeys(raw: unknown): void {
  const program = (raw as { program?: unknown } | null)?.program;
  if (!program || typeof program !== "object") return;

  const complain = (where: string, obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      const advice = REMOVED_KEYS[key];
      if (advice) {
        throw new Error(`${where}: \`${key}\` is no longer part of the format - ${advice}`);
      }
    }
  };

  const p = program as { name_en?: unknown; days?: unknown };
  if (p.name_en !== undefined) {
    throw new Error(`program: \`name_en\` is no longer part of the format - ${REMOVED_KEYS.name_en}`);
  }

  if (!Array.isArray(p.days)) return;
  p.days.forEach((day, dayIdx) => {
    const where = `day ${dayIdx + 1}`;
    if (day && typeof day === "object" && "name_en" in day) {
      throw new Error(`${where}: \`name_en\` is no longer part of the format - ${REMOVED_KEYS.name_en}`);
    }
    const exercises = (day as { exercises?: unknown })?.exercises;
    if (!Array.isArray(exercises)) return;
    exercises.forEach((ex, exIdx) => {
      complain(`day ${dayIdx + 1}, exercise ${exIdx + 1}`, ex);
    });
  });
}

export function parseWorkoutYaml(content: string): ParsedProgram {
  const raw = yaml.load(content);

  // Checked before zod, so a v1 file gets "muscles now live in the catalog"
  // rather than an unhelpful list of unrecognised keys.
  checkRemovedKeys(raw);

  const result = ProgramSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length
      ? `${first.path.join(".")}: `
      : "";
    throw new Error(`Invalid program YAML: ${where}${first?.message ?? result.error.message}`);
  }

  const program = result.data.program;

  const seen = new Set<string>();
  for (const [dayIdx, day] of program.days.entries()) {
    for (const [exIdx, ex] of day.exercises.entries()) {
      const key = `${dayIdx}:${ex.exercise}`;
      if (seen.has(key)) {
        throw new Error(
          `day ${dayIdx + 1}, exercise ${exIdx + 1}: \`${ex.exercise}\` appears twice in the same day.`,
        );
      }
      seen.add(key);
    }
  }

  return program;
}
