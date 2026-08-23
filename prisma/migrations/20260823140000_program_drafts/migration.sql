-- Coach-proposed programs wait for the user to approve them.
-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rationale" TEXT NOT NULL DEFAULT '';

