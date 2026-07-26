import type { GenerateSuggestionInput } from "./types";
import {
  MUSCLE_LABEL,
  MUSCLE_GROUP_LABEL,
  WEEKLY_SET_FLOOR,
  WEEKLY_SET_CEILING,
} from "../muscles";
import { VOLUME_WINDOW_DAYS } from "../volume";

const VERDICT_PHRASE = {
  low: `below the ${WEEKLY_SET_FLOOR}-set floor`,
  adequate: `within the ${WEEKLY_SET_FLOOR}-${WEEKLY_SET_CEILING} set range`,
  high: `above the ${WEEKLY_SET_CEILING}-set ceiling`,
} as const;

/**
 * Assembles a single text prompt from the exercise, program-exercise
 * (for `setsCount`), history across all programs, and both memory tiers.
 *
 * Kept deliberately provider-agnostic: it returns plain text, not an
 * SDK-specific request shape, so any `CoachProvider` implementation can
 * consume it unchanged.
 */
export function buildCoachPrompt(input: GenerateSuggestionInput): string {
  const {
    exercise,
    programExercise,
    history,
    exerciseMemory,
    globalMemory,
    groupVolume,
  } = input;

  const sortedHistory = [...history].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });

  const historySection =
    sortedHistory.length === 0
      ? "No prior workout history for this exercise."
      : sortedHistory
          .map((log) => {
            const date =
              typeof log.date === "string"
                ? log.date
                : log.date.toISOString().slice(0, 10);
            const setsDesc = log.sets
              .map((s) => `${s.weight ?? "?"}kg x ${s.reps ?? "?"}`)
              .join(", ");
            return `- ${date}: ${setsDesc}`;
          })
          .join("\n");

  const labelsEn = (muscles: typeof exercise.musclesPrimary) =>
    muscles.map((m) => MUSCLE_LABEL[m].en).join(", ");

  const volumeSection =
    groupVolume && groupVolume.length > 0
      ? [
          `## Weekly volume (trailing ${VOLUME_WINDOW_DAYS} days, muscle groups this exercise trains)`,
          ...groupVolume.map(
            ({ group, sets, verdict }) =>
              `${MUSCLE_GROUP_LABEL[group].en}: ${sets} hard sets - ${VERDICT_PHRASE[verdict]}`
          ),
          "A secondary mover counts as half a set toward its group.",
          "",
        ]
      : [];

  const lines = [
    "You are a strength-training coach generating the next workout suggestion for a single exercise.",
    "",
    ...volumeSection,
    "## Exercise",
    `Name: ${exercise.nameEn} (${exercise.nameFa})`,
    `Primary muscles: ${labelsEn(exercise.musclesPrimary) || "unspecified"}`,
    exercise.musclesSecondary.length > 0
      ? `Secondary muscles: ${labelsEn(exercise.musclesSecondary)}`
      : "",
    exercise.descriptionEn ? `Description: ${exercise.descriptionEn}` : "",
    "",
    "## Program prescription",
    `Sets required: ${programExercise.setsCount}`,
    `Target reps per set: ${programExercise.reps.join(", ") || "unspecified"}`,
    "",
    "## History (across all programs, most recent first)",
    historySection,
    "",
    "## Exercise memory (notes specific to this exercise)",
    exerciseMemory ?? "(none yet)",
    "",
    "## Global memory (notes about the user across all exercises)",
    globalMemory ?? "(none yet)",
    "",
    "## Instructions",
    `Respond with a single JSON object (no markdown fences, no extra prose) with exactly these keys:`,
    `- "sets": an array of EXACTLY ${programExercise.setsCount} objects, each { "weight": number|null, "reps": number|null }`,
    `- "rationale": a short string explaining the suggestion`,
    `- "updatedExerciseMemory": the revised exercise-specific memory string`,
    `- "updatedGlobalMemory": the revised global memory string`,
    groupVolume && groupVolume.length > 0
      ? "Weigh the weekly volume above when deciding how hard to push: back off when a group is already above its ceiling, and prefer adding work when it is below the floor. Say which way it pushed you in the rationale."
      : "",
    "Produce the suggestion and the revised memory together in this single response.",
  ];

  return lines.filter((line) => line !== "").join("\n");
}
