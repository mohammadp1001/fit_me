-- Username/password accounts and invite-only signup (#60).
--
-- Hand-written for one reason: `User.id` stops being `@default(1)` and becomes
-- a real sequence. The generated migration creates that sequence starting at 1,
-- so the very first invited account would try to claim id 1 - the row that
-- already holds the entire existing training history - and fail on the primary
-- key. The `setval` below is the whole point of this file.

-- --- User: credentials -----------------------------------------------------

-- Both nullable on purpose. Account 1 predates accounts entirely: it exists
-- with a full history and no credentials until its owner claims it at /claim.
-- A user with either field null cannot log in, which is exactly the state we
-- want an unclaimed account to be in.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- --- User.id: from a pinned 1 to a real sequence ---------------------------

CREATE SEQUENCE user_id_seq;
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT nextval('user_id_seq');
ALTER SEQUENCE user_id_seq OWNED BY "User"."id";

-- Start past every id that already exists. Without this the sequence begins at
-- 1 and the first signup collides with the existing account.
SELECT setval('user_id_seq', COALESCE((SELECT MAX("id") FROM "User"), 0) + 1, false);

-- --- Invite ----------------------------------------------------------------

CREATE TABLE "Invite" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" INTEGER,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE UNIQUE INDEX "Invite_redeemedById_key" ON "Invite"("redeemedById");
CREATE INDEX "Invite_expiresAt_idx" ON "Invite"("expiresAt");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_redeemedById_fkey"
  FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- OAuth grants belong to an account -------------------------------------

-- The consent screen now signs in a *specific* user, so the code it issues and
-- the token that code becomes must record which one. Without that a token
-- could act as anybody.
--
-- Existing rows were issued against a shared passphrase and belong to nobody in
-- particular, so they are deleted rather than backfilled with a guess. Every
-- connected chatbot reconnects once - which it would have to anyway, since the
-- credentials it was authorized with no longer exist.
DELETE FROM "OAuthCode";
DELETE FROM "OAuthToken";

ALTER TABLE "OAuthCode" ADD COLUMN "userId" INTEGER NOT NULL;
ALTER TABLE "OAuthToken" ADD COLUMN "userId" INTEGER NOT NULL;

CREATE INDEX "OAuthToken_userId_idx" ON "OAuthToken"("userId");

ALTER TABLE "OAuthCode" ADD CONSTRAINT "OAuthCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
