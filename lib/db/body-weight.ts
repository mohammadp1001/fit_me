import { prisma } from "@/lib/prisma";

/** Body-weight entries. One per user per day, enforced by the schema. */

export async function listBodyWeight(
  userId: number,
  { from, to, limit }: { from?: Date; to?: Date; limit?: number } = {},
) {
  return prisma.bodyWeight.findMany({
    where: {
      userId,
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { date: "asc" },
    ...(limit ? { take: limit } : {}),
  });
}

/**
 * Most recent entries first, capped.
 *
 * Separate from `listBodyWeight` because the cap has to apply to the *newest*
 * entries: taking the first N of an ascending list would silently return the
 * oldest N and call it a trend.
 */
export async function listRecentBodyWeight(
  userId: number,
  { from, to, limit }: { from?: Date; to?: Date; limit: number },
) {
  return prisma.bodyWeight.findMany({
    where: {
      userId,
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { date: "desc" },
    take: limit,
  });
}

export async function upsertBodyWeight(
  userId: number,
  { weightKg, date }: { weightKg: number; date: Date },
) {
  return prisma.bodyWeight.upsert({
    where: { userId_date: { userId, date } },
    update: { weightKg },
    create: { userId, weightKg, date },
  });
}
