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

export async function getUser(userId: number) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function updateUser(
  userId: number,
  data: Partial<ProfileInput>,
) {
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
