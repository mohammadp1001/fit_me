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
 */
const RULES = [
  "The whole document is a single top-level `program:` object. A file whose `name:` and `days:` sit at the root is rejected - this is the most common structural mistake.",
  "`name` is the primary key for an exercise. An exercise is matched against the library by name, so reuse the exact existing name when you mean an existing lift.",
  "`muscles` is an object with `primary` (required, non-empty) and `secondary` (optional). The legacy flat list is rejected, not coerced.",
  "Every entry in `primary` and `secondary` must come from the muscle vocabulary below. Unknown values are a validation error.",
  "`primary` and `secondary` must not overlap.",
  "`reps` is either a single integer applied to every set, or a list with one entry per set.",
  "`superset_with` must be declared on BOTH partners, each naming the other.",
  "Bilingual fields: the base field is the primary language, and an optional `*_en` variant supplies English. When `*_en` is missing it falls back to the base value.",
  "Fields that are not in the schema are silently dropped, so an invented key fails quietly rather than loudly. Stick to the template.",
  "Re-uploading a YAML overwrites `muscles` and any supplied `video`, but only backfills empty prose fields (description, tips, mistakes).",
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
