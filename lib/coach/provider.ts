/**
 * A swappable interface for the LLM backing the coaching generation core.
 *
 * Real providers (Anthropic, OpenAI, ...) implement `complete` by sending
 * `prompt` to their API and returning the raw text response. This slice only
 * ships a deterministic mock implementation (`MockCoachProvider`) - no
 * network call or API key is required to run the module or its tests.
 *
 * The prompt-building and validation logic in `generateSuggestion` never
 * depend on which provider is plugged in.
 */
export interface CoachProvider {
  /**
   * Send `prompt` to the underlying LLM and return its raw text response.
   * The response is expected to be a JSON string matching
   * `SuggestionOutputSchema` (see `types.ts`); `generateSuggestion` is
   * responsible for parsing and validating it.
   */
  complete(prompt: string): Promise<string>;
}
