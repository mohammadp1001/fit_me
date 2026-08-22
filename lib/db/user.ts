import { prisma } from "@/lib/prisma";

/**
 * The user profile.
 *
 * Every function takes `userId` first, like the rest of `lib/db` - see the
 * module comment in `lib/db/programs.ts` for why the argument is required
 * rather than ambient.
 */

export interface ProfileInput {
  name: string;
  weightKg: number;
  heightCm: number;
}

/**
 * Fields the profile screen may change. Separate from `ProfileInput` because
 * `upsertUser` is driven by the YAML upload, which knows nothing about where
 * the user is and must not blank the zone it never sent.
 */
export interface ProfileUpdate extends Partial<ProfileInput> {
  timeZone?: string;
}

/**
 * The profile, safe to hand to a client.
 *
 * The column list is explicit rather than a bare `findUnique`, because both
 * callers ship the result straight to the browser - `/api/user` returns it and
 * the locale page spreads it into a client component. A default select returns
 * every column, `passwordHash` among them, which broke the promise written on
 * the model itself: it never leaves the server. Selecting by name also means a
 * future secret-shaped column is excluded until someone deliberately adds it.
 */
export async function getUser(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      weightKg: true,
      heightCm: true,
      timeZone: true,
      isAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateUser(userId: number, data: ProfileUpdate) {
  return prisma.user.update({ where: { id: userId }, data });
}

/**
 * Creates the profile if it does not exist yet, otherwise updates it.
 *
 * Used by the YAML upload, which doubles as onboarding: the first upload is
 * where a brand-new install gets its name, weight and height.
 */
export async function upsertUser(userId: number, data: ProfileInput) {
  return prisma.user.upsert({
    where: { id: userId },
    update: data,
    create: { id: userId, ...data },
  });
}
