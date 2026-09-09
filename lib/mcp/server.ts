import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProgramSchema } from "./tools/program-schema";
import {
  getBodyWeight,
  getCoachMemory,
  getExerciseHistory,
  getProgram,
  getProgressSummary,
  getVolume,
  listExercises,
  listPrograms,
  validateProgramYaml,
  LIMITS,
} from "./tools/read-tools";
import { saveSuggestions } from "./tools/save-suggestions";
import { addExercise } from "./tools/add-exercise";
import { saveProgramDraft } from "./tools/save-program-draft";
import {
  getSessionDetail,
  listSessionsSummary,
  SESSION_LIMITS,
} from "./tools/session-tools";

/**
 * Builds the FitMe MCP server.
 *
 * A fresh instance per request. The transport runs stateless (Vercel functions
 * share no memory between invocations, so there is nowhere for a session to
 * live), and a per-request server keeps that honest - no state can accumulate
 * on an instance that the next request will not have.
 *
 * Tool *implementations* live in `lib/mcp/tools/` as plain async functions, so
 * they can be tested directly against Postgres without going through the
 * protocol. This file is only registration.
 */

/** Wraps a tool result as MCP text content. */
function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Turns a thrown error into a readable tool error the model can act on.
 *
 * Returned in-band with `isError` rather than thrown, because the model has to
 * be able to *read* the failure and correct itself. `resolveExerciseStrict`
 * deliberately puts near-matches in its message, and that only helps if the
 * message reaches the model.
 */
function asError(err: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: err instanceof Error ? err.message : String(err),
      },
    ],
  };
}

/** Read-only tools touch nothing outside this deployment. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

/**
 * `save_suggestions` writes, but never destroys: it upserts a proposal for a
 * future date and appends to notes. `idempotentHint` because saving the same
 * day twice converges rather than accumulating.
 */
const WRITES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Refuses a call whose token was not granted `fitme:write`.
 *
 * The scope is granted at consent time, so this is the difference between a
 * connection the user approved for reading and one approved for writing. Read
 * tools deliberately do not check it - every token carries `fitme:read`.
 */
function requiresWriteScope(extra: { authInfo?: { scopes?: string[] } }): boolean {
  return !(extra.authInfo?.scopes ?? []).includes("fitme:write");
}

/**
 * @param userId The account this connection acts as, taken from the verified
 * OAuth token. Passed in rather than read from a session: the MCP endpoint is
 * reached with a bearer token and has no browser cookie to consult.
 */
export function buildMcpServer(userId: number): McpServer {
  const server = new McpServer(
    { name: "fitme", version: "0.2.0" },
    {
      instructions:
        "FitMe is a personal workout tracker for a single user. " +
        "Start with get_progress_summary for anything about how training is " +
        "going - it returns computed trends rather than raw sets, so you do " +
        "not have to do arithmetic. Use get_exercise_history only when you " +
        "need the actual sets for one lift. " +
        "Call get_program_schema before writing or editing any program YAML, " +
        "and validate_program_yaml before showing a draft to the user - " +
        "invented muscle names are rejected by the parser. " +
        "Exercises are addressed by name; if a name is not found the error " +
        "lists near-matches, and list_exercises shows the whole library. " +
        "To review a workout, skim list_sessions first and open only the " +
        "sessions you need with get_session - the index already carries the " +
        "muscle groups each session trained, so you rarely need to open more " +
        "than one or two. A session carries the user's own notes; read them " +
        "before judging the numbers, because they explain what the numbers " +
        "cannot. " +
        "To change the training plan itself, write the YAML and call " +
        "save_program_draft. It saves a proposal the user approves in the app - " +
        "it never replaces what they are following. Use save_suggestions for " +
        "next-session weights, which is the everyday case; a program rewrite is " +
        "for restructuring a block. " +
        "If a movement you want to prescribe is not in the library, search " +
        "list_exercises first - the catalog has hundreds of entries and the " +
        "same movement is often already there under a different name. Only " +
        "then call add_exercise, which adds it for this user alone. " +
        "When coaching a session: read get_coach_memory first so you continue " +
        "from what was already learned, then propose sets, show them to the " +
        "user with your reasoning, and only then call save_suggestions. What " +
        "you save appears on the log screen at the gym.",
    },
  );

  server.registerTool(
    "get_program_schema",
    {
      title: "Get program YAML schema",
      description:
        "Returns the annotated FitMe program YAML template, the closed muscle " +
        "vocabulary (every allowed value for muscles.primary / muscles.secondary), " +
        "and the validation rules the parser enforces. Call this before drafting " +
        "or editing a program.",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return asText(await getProgramSchema());
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_progress_summary",
    {
      title: "Get progress summary",
      description:
        "Computed training summary over a trailing window: body-weight trend, " +
        "hard-set volume per muscle group with the 10/20-set landmarks, and per " +
        "exercise the session count, best set, estimated 1RM trend and whether " +
        "it has stalled. Returns no raw sets - use get_exercise_history for those. " +
        "This is the right first call for any question about how training is going. " +
        "Note that `oneRepMaxChange` spans the whole window while `stalled` looks " +
        "only at the last three sessions, so a lift that climbed early and then " +
        "flattened shows a positive change and stalled=true. That is not a " +
        "contradiction: it is a plateau, and `stalled` is the actionable signal.",
      inputSchema: {
        weeks: z
          .number()
          .int()
          .min(1)
          .max(104)
          .optional()
          .describe("Trailing window in weeks. Defaults to 8."),
      },
      annotations: READ_ONLY,
    },
    async ({ weeks }) => {
      try {
        return asText(await getProgressSummary({ userId, weeks }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_exercise_history",
    {
      title: "Get exercise history",
      description:
        "Raw logged sets for one exercise, newest first. Use when the summary " +
        "is not enough and you need the actual weights and reps.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Exercise name, in either Persian or English."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(LIMITS.exerciseHistory)
          .optional()
          .describe(`Sessions to return. Defaults to 50, max ${LIMITS.exerciseHistory}.`),
      },
      annotations: READ_ONLY,
    },
    async ({ name, limit }) => {
      try {
        return asText(await getExerciseHistory({ userId, name, limit }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_volume",
    {
      title: "Get weekly volume",
      description:
        "Hard sets per muscle group, with a low / adequate / high verdict " +
        "against the 10 and 20 set weekly landmarks. Defaults to the trailing " +
        "7 days; widen it with `weeks` to judge a whole training block, since " +
        "one week is far too short to tell whether a split needs changing.",
      inputSchema: {
        weeks: z
          .number()
          .int()
          .min(1)
          .max(26)
          .optional()
          .describe("Weeks to look back over. Defaults to 1, max 26."),
      },
      annotations: READ_ONLY,
    },
    async ({ weeks }) => {
      try {
        return asText(await getVolume({ userId, weeks }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "list_sessions",
    {
      title: "List workout sessions",
      description:
        "A skimmable index of recent workouts, newest first: local date and " +
        "time, how long it ran, how many exercises, how many carried a note " +
        "from the user, and hard sets per muscle group. Start here, then open " +
        "only the sessions you actually need with get_session.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(SESSION_LIMITS.list)
          .optional()
          .describe(
            `Sessions to return. Defaults to ${SESSION_LIMITS.defaultList}, max ${SESSION_LIMITS.list}.`,
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ limit }) => {
      try {
        return asText(await listSessionsSummary({ userId, limit }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_session",
    {
      title: "Get one workout session",
      description:
        "Everything logged in one workout, in the order it was performed: " +
        "each exercise with its own timestamp, actual against planned sets " +
        "and reps, whether the work was completed, and the user's note to " +
        "you. Call with no arguments for the most recent session.",
      inputSchema: {
        id: z
          .number()
          .int()
          .optional()
          .describe("Session id, as returned by list_sessions."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            "Local date, YYYY-MM-DD. If the user trained twice that day, " +
              "returns the later session.",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ id, date }) => {
      try {
        return asText(await getSessionDetail({ userId, id, date }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_body_weight",
    {
      title: "Get body weight history",
      description:
        "Body-weight entries oldest first, with a least-squares trend in kg per week.",
      inputSchema: {
        from: z.string().optional().describe("Inclusive start date, YYYY-MM-DD."),
        to: z.string().optional().describe("Inclusive end date, YYYY-MM-DD."),
        limit: z.number().int().min(1).max(LIMITS.bodyWeight).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ from, to, limit }) => {
      try {
        return asText(await getBodyWeight({ userId, from, to, limit }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_coach_memory",
    {
      title: "Get coach memory",
      description:
        "The coach's running notes: one global note plus per-exercise notes. " +
        "Read this at the start of a coaching conversation so you continue from " +
        "what was already learned instead of re-deriving it from logs.",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe("Limit to one exercise. Omit for all notes."),
      },
      annotations: READ_ONLY,
    },
    async ({ name }) => {
      try {
        return asText(await getCoachMemory({ userId, name }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "list_programs",
    {
      title: "List programs",
      description: "All saved programs, with which one is active.",
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return asText(await listPrograms({ userId }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "get_program",
    {
      title: "Get program",
      description:
        "Full structure of one program: days, exercises, sets, reps and superset " +
        "grouping. Defaults to the active program. Each exercise carries the " +
        "`slug` a program file must reference, so a program read here can be " +
        "edited and written straight back with save_program_draft.",
      inputSchema: {
        id: z.number().int().optional().describe("Program id. Omit for the active one."),
      },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      try {
        return asText(await getProgram({ userId, id }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "list_exercises",
    {
      title: "List library exercises",
      description:
        "The exercise library. Every entry carries a `slug` and a display name: " +
        "program YAML addresses an exercise by its slug, while save_suggestions " +
        "and get_exercise_history take the name. Look the slug up here rather " +
        "than deriving one from a name - they do not match predictably " +
        "(\"Dumbbell Incline Press\" is `dumbbell_incline_press`, but many are " +
        "not that tidy), and an invented slug fails the whole upload.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe("Case-insensitive substring filter on the display name."),
        limit: z.number().int().min(1).max(LIMITS.exercises).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ search, limit }) => {
      try {
        return asText(await listExercises({ userId, search, limit }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "validate_program_yaml",
    {
      title: "Validate program YAML",
      description:
        "Runs a candidate program YAML through the exact parser the upload path " +
        "uses and reports any errors. Writes nothing. Always check a draft here " +
        "before showing it to the user.",
      inputSchema: {
        yaml: z.string().min(1).describe("The full program YAML document."),
      },
      annotations: READ_ONLY,
    },
    async ({ yaml }) => {
      try {
        return asText(await validateProgramYaml({ yaml }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "add_exercise",
    {
      title: "Add an exercise to this user's library",
      description:
        "Creates an exercise the catalog does not carry, in THIS user's " +
        "library only - the shared catalog is never modified. Returns a slug " +
        "you can reference from a program file straight away. " +
        "Search list_exercises first: the catalog has hundreds of entries and " +
        "the same movement is often already there under a different name. " +
        "Muscles must come from the fixed vocabulary in get_program_schema.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(80)
          .describe("Display name, in English."),
        musclesPrimary: z
          .array(z.string())
          .min(1)
          .describe(
            "The muscles this mainly trains. At least one - an exercise with " +
              "no primary mover counts toward no volume at all.",
          ),
        musclesSecondary: z
          .array(z.string())
          .optional()
          .describe("Muscles it assists. Must not repeat a primary muscle."),
        description: z
          .string()
          .max(2000)
          .optional()
          .describe("How to perform it."),
        videoUrl: z.string().optional().describe("A link demonstrating it."),
      },
    },
    async (args) => {
      try {
        return asText(await addExercise({ userId, ...args }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "save_program_draft",
    {
      title: "Propose a program",
      description:
        "Saves a proposed program as a DRAFT for the user to approve in the " +
        "app. It never activates: their current program keeps running " +
        "untouched until they accept it. " +
        "Call get_program_schema first and validate_program_yaml before this, " +
        "and show the user the program and your reasoning - what you save is " +
        "what they will be asked to approve. " +
        "Refused if the YAML does not parse, if any exercise slug is unknown, " +
        "or if a proposal is already waiting for them.",
      inputSchema: {
        yaml: z
          .string()
          .min(1)
          .describe("The complete program YAML, in the current format."),
        rationale: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            "Why you are proposing this. The user reads it next to the " +
              "changes when deciding.",
          ),
        replaceExisting: z
          .boolean()
          .optional()
          .describe(
            "Throw away a proposal the user has not answered yet. Defaults " +
              "to false, which refuses rather than discarding it silently.",
          ),
      },
    },
    async (args) => {
      try {
        return asText(await saveProgramDraft({ userId, ...args }));
      } catch (err) {
        return asError(err);
      }
    },
  );

  server.registerTool(
    "save_suggestions",
    {
      title: "Save suggested sets",
      description:
        "Saves the sets you propose for an upcoming session, so they appear on " +
        "the log screen at the gym, and appends what you learned to the coach's " +
        "notes. " +
        "Show the user what you intend to save and why before calling it - the " +
        "arguments are what they approve. " +
        "Refused if the date is in the past, if that exercise was already logged " +
        "that day, or if the exercise is not in the active program.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Session date, YYYY-MM-DD. Today or later only."),
        items: z
          .array(
            z.object({
              exercise: z
                .string()
                .min(1)
                .describe("Exercise name, Persian or English, as stored."),
              sets: z
                .array(
                  z.object({
                    weightKg: z
                      .number()
                      .nonnegative()
                      .nullable()
                      .describe("Load in kg, or null for bodyweight."),
                    reps: z.number().int().positive(),
                  }),
                )
                .min(1),
              why: z
                .string()
                .min(1)
                .describe(
                  "Short reason for these numbers. Shown to the user, so make it judgeable.",
                ),
            }),
          )
          .min(1),
        exerciseNotes: z
          .array(
            z.object({
              exercise: z.string().min(1),
              note: z.string().min(1),
            }),
          )
          .optional()
          .describe("Durable observations about a lift. Appended, never replaced."),
        globalNote: z
          .string()
          .optional()
          .describe("A durable observation about the user's training overall."),
      },
      annotations: WRITES,
    },
    async ({ date, items, exerciseNotes, globalNote }, extra) => {
      if (requiresWriteScope(extra)) {
        return asError(
          new Error(
            "This connection was not granted the fitme:write scope. " +
              "Reconnect and approve write access to save suggestions.",
          ),
        );
      }

      try {
        return asText(
          await saveSuggestions({
            userId,
            date,
            items,
            exerciseNotes,
            globalNote,
          }),
        );
      } catch (err) {
        return asError(err);
      }
    },
  );

  return server;
}
