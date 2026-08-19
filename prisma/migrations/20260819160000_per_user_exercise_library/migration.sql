-- Per-user exercise library and global memory (#59).
--
-- Hand-written rather than taken straight from `prisma migrate diff`. The
-- generated version does `ADD COLUMN "userId" INTEGER NOT NULL` on two tables
-- that already hold rows, which Postgres rejects outright. The three-step
-- add-nullable / backfill / set-not-null below is the same change done safely.
--
-- It is also the reason `prisma db push` (the Vercel build command) will refuse
-- this deploy: it drops a unique index and adds a stricter one on populated
-- data. Run this file by hand in the Neon console first, then re-run the
-- deploy - the same sequence as v0.4.2. Do NOT add `--accept-data-loss`.

-- Everything existing belongs to account 1. Refuse rather than guess if that
-- account is missing but data is not: silently inventing an owner would attach
-- someone's whole training history to a row nobody claimed.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Exercise") > 0 AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 1) THEN
    RAISE EXCEPTION
      'Exercise rows exist but User 1 does not. Refusing to guess an owner - create User 1 first, or clear the library.';
  END IF;
  IF (SELECT COUNT(*) FROM "GlobalMemory") > 0 AND NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 1) THEN
    RAISE EXCEPTION
      'GlobalMemory rows exist but User 1 does not. Refusing to guess an owner.';
  END IF;
END $$;

-- --- User ------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Account 1 is the admin: it is the only account that exists, and #60 makes
-- inviting an admin-only action.
UPDATE "User" SET "isAdmin" = true WHERE "id" = 1;

-- --- Exercise --------------------------------------------------------------

ALTER TABLE "Exercise" ADD COLUMN "userId" INTEGER;
UPDATE "Exercise" SET "userId" = 1 WHERE "userId" IS NULL;
ALTER TABLE "Exercise" ALTER COLUMN "userId" SET NOT NULL;

-- `nameFa` was unique across the whole table. Scoping it per user is what lets
-- two accounts each own a row with the same Persian name.
DROP INDEX "Exercise_nameFa_key";
CREATE UNIQUE INDEX "Exercise_userId_nameFa_key" ON "Exercise"("userId", "nameFa");
CREATE INDEX "Exercise_userId_idx" ON "Exercise"("userId");

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --- GlobalMemory ----------------------------------------------------------

-- Was a singleton pinned to `id = 1`. It becomes one row per user, so `id`
-- needs a real sequence and `userId` becomes the key that matters.
CREATE SEQUENCE globalmemory_id_seq;
ALTER TABLE "GlobalMemory" ALTER COLUMN "id" SET DEFAULT nextval('globalmemory_id_seq');
ALTER SEQUENCE globalmemory_id_seq OWNED BY "GlobalMemory"."id";

-- Start the sequence past any existing id, or the first insert collides with
-- the row that is already there.
SELECT setval('globalmemory_id_seq', COALESCE((SELECT MAX("id") FROM "GlobalMemory"), 0) + 1, false);

ALTER TABLE "GlobalMemory" ADD COLUMN "userId" INTEGER;
UPDATE "GlobalMemory" SET "userId" = 1 WHERE "userId" IS NULL;
ALTER TABLE "GlobalMemory" ALTER COLUMN "userId" SET NOT NULL;

CREATE UNIQUE INDEX "GlobalMemory_userId_key" ON "GlobalMemory"("userId");

ALTER TABLE "GlobalMemory" ADD CONSTRAINT "GlobalMemory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
