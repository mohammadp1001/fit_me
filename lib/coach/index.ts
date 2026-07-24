export { generateSuggestion } from "./generate-suggestion";
export type { CoachProvider } from "./provider";
export {
  MockCoachProvider,
  BrokenJsonCoachProvider,
  InvalidShapeCoachProvider,
} from "./mock-provider";
export { buildCoachPrompt } from "./prompt";
export {
  SuggestionOutputSchema,
  SuggestedSetSchema,
} from "./types";
export type {
  CoachExercise,
  CoachProgramExercise,
  CoachWorkoutLog,
  GenerateSuggestionInput,
  SuggestionOutput,
  SuggestedSet,
} from "./types";
