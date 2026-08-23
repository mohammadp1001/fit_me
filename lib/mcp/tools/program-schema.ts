import { readFile } from "fs/promises";
import path from "path";
import {
  ALL_MUSCLES,
  MUSCLE_GROUP,
  MUSCLE_GROUP_LABEL,
  MUSCLE_LABEL,
} from "@/lib/muscles";

/**
 * `get_program_schema` - everything a chatbot needs to write a valid FitMe
 * program YAML.
 *
 * Delivered as a tool rather than an MCP resource on purpose: resource support
 * is uneven across clients and models routinely never fetch them, which shows
 * up as invented muscle names. A tool always gets called.
 *
 * Both halves are derived at request time. The template is read from
 * `examples/TEMPLATE.yaml` (the parser-verified source of truth) and the
 * vocabulary from `lib/muscles.ts` (whose `Record<Muscle, …>` typing makes a
 * missing entry a compile error). Neither can drift from what the upload path
 * actually accepts.
 */

/**
 * Rules the YAML parser enforces that the annotated template does not state
 * outright. Written here rather than left for the model to infer, because each
 * one is a rejection it would otherwise discover by trial and error.
 *
 * The muscle vocabulary is still returned alongside these, even though a
 * program file no longer names a muscle: `add_exercise` does, and it is the
 * same closed list.
 */
const RULES = [
  "The whole document is a single top-level `program:` object. A file whose `name:` and `days:` sit at the root is rejected - this is the most common structural mistake.",
  "An exercise is addressed by `exercise: <slug>` - lowercase letters, digits and underscores, e.g. `barbell_squat`. It is never a display name. Call list_exercises to find the slug you want.",
  "An unknown slug fails the whole upload and the error lists near-matches. Nothing is guessed and nothing is created, so a program with one bad slug leaves the previous program active and untouched.",
  "A program carries NO anatomy. `muscles`, `description`, `tips`, `mistakes` and `video` are not part of the format and are rejected outright - those are facts about the exercise and live in the catalog.",
  "`reps` is either a single integer applied to every set, or a list with one entry per set.",
  "`superset_with` must be declared on BOTH partners, each naming the other's slug.",
  "`note` is optional and is your reasoning for the prescription. It is not the user's note - that one is written per session on the log screen.",
  "Any key not in the schema is a validation error, not silently dropped. An invented key fails loudly.",
  "Uploading a program can no longer change what an exercise is. To add a movement the catalog does not carry, call add_exercise - it lands in this user's library only and returns a slug you can then reference.",
];

export interface ProgramSchema {
  template: string;
  muscles: Array<{ value: string; group: string; labelEn: string; labelFa: string }>;
  muscleGroups: Array<{ value: string; labelEn: string; labelFa: string }>;
  rules: string[];
}

export async function getProgramSchema(): Promise<ProgramSchema> {
  // `process.cwd()` is the project root in both `next dev` and the serverless
  // bundle. The file is kept in the bundle by `outputFileTracingIncludes` in
  // next.config.ts - nothing imports it, so tracing cannot infer it.
  const templatePath = path.join(process.cwd(), "examples", "TEMPLATE.yaml");
  const template = await readFile(templatePath, "utf8");

  return {
    template,
    muscles: ALL_MUSCLES.map((muscle) => ({
      value: muscle,
      group: MUSCLE_GROUP[muscle],
      labelEn: MUSCLE_LABEL[muscle].en,
      labelFa: MUSCLE_LABEL[muscle].fa,
    })),
    muscleGroups: Object.entries(MUSCLE_GROUP_LABEL).map(([value, label]) => ({
      value,
      labelEn: label.en,
      labelFa: label.fa,
    })),
    rules: RULES,
  };
}
