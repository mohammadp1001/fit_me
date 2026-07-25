import type { GenerateSuggestionInput } from "./types";

/**
 * Assembles a single text prompt from the exercise, program-exercise
 * (for `setsCount`), history across all programs, and both memory tiers.
 *
 * Kept deliberately provider-agnostic: it returns plain text, not an
 * SDK-specific request shape, so any `CoachProvider` implementation can
 * consume it unchanged.
 */
export function buildCoachPrompt(input: GenerateSuggestionInput): string {
  const { exercise, programExercise, history, exerciseMemory, globalMemory } =
    input;

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

  const lines = [
    "You are a strength-training coach generating the next workout suggestion for a single exercise.",
    "",
    "## Exercise",
    `Name: ${exercise.nameEn} (${exercise.nameFa})`,
    `Muscles: ${exercise.muscles.join(", ") || "unspecified"}`,
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
    "Produce the suggestion and the revised memory together in this single response.",
  ];

  return lines.filter((line) => line !== "").join("\n");
}
