import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { activateProgram, discardDraft, findDraft } from "@/lib/db/programs";
import { getPendingProposal } from "@/lib/db/program-proposal";
import { z } from "zod";

/**
 * The coach's proposed program, and the decision about it.
 *
 * The diff itself is assembled in `lib/db/program-proposal.ts`, shared with the
 * page that renders this on the server.
 */

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    draft: await getPendingProposal(await currentUserId()),
  });
}

const schema = z.object({
  programId: z.number().int().positive(),
  action: z.enum(["approve", "discard"]),
});

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = await currentUserId();
  const { programId, action } = parsed.data;

  // Re-read rather than trusting the id: the draft may have been replaced by
  // the coach, or already answered in another tab, since this screen loaded.
  const draft = await findDraft(userId);
  if (!draft || draft.id !== programId) {
    return NextResponse.json(
      { error: "That proposal is no longer waiting for you." },
      { status: 409 },
    );
  }

  if (action === "approve") {
    await activateProgram(userId, programId);
    return NextResponse.json({ ok: true, activated: true });
  }

  await discardDraft(userId, programId);
  return NextResponse.json({ ok: true, activated: false });
}
