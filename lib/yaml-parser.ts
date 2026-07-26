import yaml from "js-yaml";
import { z } from "zod";
import { Muscle } from "@prisma/client";
import { isMuscle, suggestMuscle } from "./muscles";

/**
 * `muscles` is validated outside zod (see `resolveMuscles`) so that failures can
 * name the day, the exercise, the offending value and a suggested correction.
 * zod's own path-based message ("days.0.exercises.2.muscles.primary.1") is not
 * something a user editing a YAML file can act on.
 */
const ExerciseSchema = z.object({
  name: z.string(),
  muscles: z.unknown(),
  sets: z.number().int().positive(),
  reps: z.union([
    z.array(z.number().int().positive()),
    z.number().int().positive().transform((n) => [n]),
  ]),
  superset_with: z.string().nullable().optional(),
  video: z.string().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  tips: z.array(z.string()).optional(),
  tips_en: z.array(z.string()).optional(),
  mistakes: z.array(z.string()).optional(),
  mistakes_en: z.array(z.string()).optional(),
});

const DaySchema = z.object({
  name: z.string(),
  name_en: z.string().optional(),
  exercises: z.array(ExerciseSchema),
});

const ProgramSchema = z.object({
  program: z.object({
    name: z.string(),
    name_en: z.string().optional(),
    days: z.array(DaySchema),
  }),
});

type RawExercise = z.infer<typeof ExerciseSchema>;

export type ParsedExercise = Omit<RawExercise, "muscles"> & {
  musclesPrimary: Muscle[];
  musclesSecondary: Muscle[];
};

export type ParsedDay = Omit<z.infer<typeof DaySchema>, "exercises"> & {
  exercises: ParsedExercise[];
};

export type ParsedProgram = Omit<
  z.infer<typeof ProgramSchema>["program"],
  "days"
> & { days: ParsedDay[] };

function toCanonical(values: unknown, where: string, role: string): Muscle[] {
  if (!Array.isArray(values)) {
    throw new Error(`${where}: muscles.${role} must be a list.`);
  }

  return values.map((value) => {
    if (typeof value !== "string") {
      throw new Error(
        `${where}: muscles.${role} contains a non-string entry (${JSON.stringify(value)}).`
      );
    }
    if (!isMuscle(value)) {
      const hint = suggestMuscle(value);
      throw new Error(
        `${where}: unknown muscle "${value}"` +
          (hint ? ` - did you mean "${hint}"?` : "") +
          ` See examples/TEMPLATE.yaml for the full list.`
      );
    }
    return value;
  });
}

function resolveMuscles(
  raw: unknown,
  where: string
): { musclesPrimary: Muscle[]; musclesSecondary: Muscle[] } {
  if (raw === undefined || raw === null) {
    throw new Error(
      `${where}: missing "muscles". Expected muscles.primary (and optionally muscles.secondary).`
    );
  }

  // The pre-taxonomy schema used a flat free-text list. Rejected outright rather
  // than coerced, so canonical and free-text values can never coexist in the DB.
  if (Array.isArray(raw)) {
    throw new Error(
      `${where}: "muscles" is now an object, not a list. Use ` +
        `muscles:\n    primary: [...]\n    secondary: [...]`
    );
  }

  if (typeof raw !== "object") {
    throw new Error(`${where}: "muscles" must be an object with a primary list.`);
  }

  const { primary, secondary } = raw as Record<string, unknown>;

  const musclesPrimary = toCanonical(primary ?? [], where, "primary");
  if (musclesPrimary.length === 0) {
    throw new Error(
      `${where}: muscles.primary must list at least one muscle - an exercise with no primary mover cannot be counted toward any volume.`
    );
  }

  const musclesSecondary = toCanonical(secondary ?? [], where, "secondary");

  const overlap = musclesSecondary.filter((m) => musclesPrimary.includes(m));
  if (overlap.length > 0) {
    throw new Error(
      `${where}: ${overlap.join(", ")} listed as both primary and secondary. Pick one role.`
    );
  }

  return { musclesPrimary, musclesSecondary };
}

export function parseWorkoutYaml(content: string): ParsedProgram {
  const raw = yaml.load(content);
  const result = ProgramSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid YAML: ${result.error.message}`);
  }

  const program = result.data.program;

  return {
    ...program,
    days: program.days.map((day, dayIdx) => ({
      ...day,
      exercises: day.exercises.map(({ muscles, ...rest }) => {
        const where = `day ${dayIdx + 1} ("${day.name}"), exercise "${rest.name}"`;
        return { ...rest, ...resolveMuscles(muscles, where) };
      }),
    })),
  };
}
