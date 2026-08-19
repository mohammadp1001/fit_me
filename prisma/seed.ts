import { PrismaClient } from "@prisma/client";
import { seedExerciseLibrary } from "../lib/db/exercise-template.ts";

const prisma = new PrismaClient();

/**
 * `npm run db:seed` seeds account 1 - the only account until someone is
 * invited. The user row has to exist first, because an exercise now has an
 * owner.
 *
 * The library itself lives in `lib/db/exercise-template.ts`, shared with the
 * signup path so a new account gets exactly the same rows.
 */
async function main() {
  const userId = 1;

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      name: "FitMe",
      weightKg: 80,
      heightCm: 180,
      isAdmin: true,
    },
  });

  console.log(`Seeding exercise library for user ${userId}...`);
  const count = await seedExerciseLibrary(userId);
  console.log(`Seeded ${count} exercises.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
