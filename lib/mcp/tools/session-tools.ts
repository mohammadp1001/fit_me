import { getSession, latestSession, listSessions, type SessionWithLogs } from "@/lib/db/sessions";
import { getUser } from "@/lib/db/user";
import { MUSCLE_GROUP_LABEL } from "@/lib/muscles";
import { toLoggedSets, volumeForEntries, type VolumeEntry } from "@/lib/volume";
import { DEFAULT_TIME_ZONE, localDay, localTime } from "@/lib/time";

/**
 * Reading workout sessions from the coach's side.
 *
 * Two tools rather than one, following the summary-then-detail shape the rest
 * of this server already uses: `list_sessions` is a thin index the model can
 * skim, `get_session` opens one. Returning whole sessions in the index would
 * dump a wall of text into the conversation and make the model worse at reading
 * any of it.
 *
 * The index is labelled by **muscle groups**, not by program day. Muscle groups
 * are the unit that actually matters when comparing sessions - "how have my
 * chest sessions gone" is answerable from the index alone, without opening
 * each one to guess from exercise names.
 */

/** Caps on anything unbounded, so one call cannot swamp a context window. */
export const SESSION_LIMITS = {
  list: 50,
  defaultList: 10,
} as const;

/** Sessions are stored as instants; the coach should read them in local time. */
async function timeZoneFor(userId: number): Promise<string> {
  const user = await getUser(userId);
  return user?.timeZone ?? DEFAULT_TIME_ZONE;
}

function volumeEntriesFor(session: SessionWithLogs): VolumeEntry[] {
  return session.logs
    .filter((log) => log.exercise !== null)
    .map((log) => ({
      date: log.date,
      sets: toLoggedSets(log.sets),
      musclesPrimary: log.exercise!.musclesPrimary,
      musclesSecondary: log.exercise!.musclesSecondary,
    }));
}

/**
 * Hard sets per muscle group for one session.
 *
 * Reuses the weighting from `lib/volume.ts` rather than counting sets here: a
 * set counts once per group at its highest role, which is the rule that stops a
 * finely-tagged exercise inflating its own volume.
 */
function musclesFor(session: SessionWithLogs) {
  const totals = volumeForEntries(volumeEntriesFor(session));
  return Object.entries(totals)
    .filter(([, sets]) => sets > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([group, sets]) => ({
      group,
      label: MUSCLE_GROUP_LABEL[group as keyof typeof MUSCLE_GROUP_LABEL].en,
      sets,
    }));
}

function durationMinutes(session: SessionWithLogs): number {
  return Math.round(
    (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000,
  );
}

function summarise(session: SessionWithLogs, timeZone: string) {
  return {
    id: session.id,
    // Filed on the day it started, so a workout that runs past local midnight
    // is not reported as two.
    date: localDay(session.startedAt, timeZone),
    startedAt: localTime(session.startedAt, timeZone),
    endedAt: localTime(session.endedAt, timeZone),
    durationMinutes: durationMinutes(session),
    exerciseCount: session.logs.length,
    noteCount: session.logs.filter((log) => log.note.length > 0).length,
    muscles: musclesFor(session),
    timeZone,
  };
}

// --- list_sessions ----------------------------------------------------------

export async function listSessionsSummary({
  userId,
  limit = SESSION_LIMITS.defaultList,
}: {
  userId: number;
  limit?: number;
}) {
  const capped = Math.min(Math.max(1, limit), SESSION_LIMITS.list);
  const [timeZone, sessions] = await Promise.all([
    timeZoneFor(userId),
    listSessions(userId, { limit: capped }),
  ]);

  return {
    timeZone,
    sessions: sessions.map((session) => summarise(session, timeZone)),
  };
}

// --- get_session ------------------------------------------------------------

export async function getSessionDetail({
  userId,
  id,
  date,
}: {
  userId: number;
  id?: number;
  date?: string;
}) {
  const timeZone = await timeZoneFor(userId);

  const session = await resolveSession({ userId, id, date, timeZone });
  if (!session) {
    throw new Error(
      id !== undefined
        ? `No session ${id}.`
        : date
          ? `No session logged on ${date}.`
          : "No sessions logged yet.",
    );
  }

  return {
    ...summarise(session, timeZone),
    exercises: session.logs.map((log) => ({
      name: log.exercise?.name ?? "(deleted exercise)",
      // Each exercise carries its own time, so the coach can see the order and
      // the pacing of the workout, not just its contents.
      at: localTime(log.loggedAt, timeZone),
      sets: toLoggedSets(log.sets).map((set, i) => ({
        weight: set.weight,
        reps: set.reps,
        plannedReps: log.plannedReps[i] ?? null,
      })),
      plannedSetCount: log.plannedReps.length,
      // Everything needed to answer "did they finish the work" without the
      // model having to compare two arrays itself.
      completedAllSets:
        log.plannedReps.length > 0 &&
        toLoggedSets(log.sets).filter((s) => s.reps !== null).length >=
          log.plannedReps.length,
      completedAllReps: completedAllReps(log.sets, log.plannedReps),
      note: log.note,
    })),
  };
}

function completedAllReps(sets: unknown, plannedReps: number[]): boolean | null {
  if (plannedReps.length === 0) return null;
  const logged = toLoggedSets(sets);
  return plannedReps.every((planned, i) => {
    const actual = logged[i]?.reps;
    return actual !== null && actual !== undefined && actual >= planned;
  });
}

async function resolveSession({
  userId,
  id,
  date,
  timeZone,
}: {
  userId: number;
  id?: number;
  date?: string;
  timeZone: string;
}): Promise<SessionWithLogs | null> {
  if (id !== undefined) return getSession(userId, id);

  if (date) {
    // Matched on the *local* day, which is what the caller means by a date -
    // and what the index reported. A UTC comparison would disagree with the
    // index for any session logged near local midnight.
    const recent = await listSessions(userId, { limit: SESSION_LIMITS.list });
    const onDate = recent.filter(
      (session) => localDay(session.startedAt, timeZone) === date,
    );
    // Latest first, so a date with a two-a-day gives the evening session -
    // the one the caller is most likely asking about.
    return onDate[0] ?? null;
  }

  return latestSession(userId);
}
