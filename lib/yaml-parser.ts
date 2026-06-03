import yaml from "js-yaml";
import { z } from "zod";

const ExerciseSchema = z.object({
  name: z.string(),
  muscles: z.array(z.string()).default([]),
  sets: z.number().int().positive(),
  reps: z.union([
    z.array(z.number().int().positive()),
    z.number().int().positive().transform((n) => [n]),
  ]),
  superset_with: z.string().nullable().optional(),
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

export type ParsedProgram = z.infer<typeof ProgramSchema>["program"];
export type ParsedDay = z.infer<typeof DaySchema>;
export type ParsedExercise = z.infer<typeof ExerciseSchema>;

export function parseWorkoutYaml(content: string): ParsedProgram {
  const raw = yaml.load(content);
  const result = ProgramSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid YAML: ${result.error.message}`);
  }
  return result.data.program;
}
