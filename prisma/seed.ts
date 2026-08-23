import { PrismaClient } from "@prisma/client";
import { seedCatalog } from "../lib/db/catalog.ts";

const prisma = new PrismaClient();

/**
 * `npm run db:seed` sets up a fresh install: account 1, and the shared exercise
 * catalog.
 *
 * There is no per-user library to seed any more. A user's library is the
 * catalog plus whatever they add, so a new account starts with 676 exercises
 * and no rows of its own.
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

  const { written } = await seedCatalog();
  console.log(`Catalog seeded: ${written} exercises.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
