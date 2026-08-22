import { prisma } from "@/lib/prisma";

/**
 * Reading workout sessions.
 *
 * Sessions are written by `upsertLog` (see `lib/db/logs.ts`) - nothing creates
 * one directly, because a session with no logs in it is not a workout. These
 * are the read paths.
 *
 * Which local day a session belongs to is deliberately not stored: it is
 * derived from `startedAt` and the user's timezone at read time, so the two can
 * never disagree.
 */

const SESSION_LOG_INCLUDE = {
  logs: {
    // Logged order, which is the order the exercises were actually performed.
    orderBy: { loggedAt: "asc" },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          musclesPrimary: true,
          musclesSecondary: true,
        },
      },
    },
  },
} as const;

/** Newest first. */
export async function listSessions(userId: number, { limit }: { limit: number }) {
  return prisma.workoutSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: SESSION_LOG_INCLUDE,
  });
}

/** One session with everything logged in it, or null. */
export async function getSession(userId: number, sessionId: number) {
  return prisma.workoutSession.findFirst({
    // Scoped by user as well as id: an id from elsewhere must not resolve.
    where: { id: sessionId, userId },
    include: SESSION_LOG_INCLUDE,
  });
}

/** The user's most recent session, or null if they have never logged one. */
export async function latestSession(userId: number) {
  return prisma.workoutSession.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: SESSION_LOG_INCLUDE,
  });
}

export type SessionWithLogs = NonNullable<Awaited<ReturnType<typeof getSession>>>;
