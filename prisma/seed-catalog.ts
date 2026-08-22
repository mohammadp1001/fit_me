import { seedCatalog } from "../lib/db/catalog.ts";

/**
 * `npm run db:seed-catalog` - brings the shared exercise catalog in line with
 * `prisma/catalog/exercises.json`.
 *
 * Idempotent, so it is safe to run repeatedly. It exists as a script rather
 * than a data migration because production applies schema with `prisma db
 * push` and never runs `migrate deploy`, so a data migration would never
 * reach it.
 */
async function main() {
  const { written } = await seedCatalog();
  console.log(`Catalog seeded: ${written} exercises.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
