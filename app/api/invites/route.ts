import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { createInvite, isAdmin, listInvites } from "@/lib/db/accounts";

const schema = z.object({ label: z.string().max(80).optional() });

/**
 * Invite management. Admin only - an ordinary account cannot hand out access.
 *
 * A non-admin gets 404 rather than 403. There is no user list and no way to
 * discover other accounts, so as far as they are concerned this endpoint does
 * not exist, and a 403 would tell them otherwise.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await currentUserId();
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const invite = await createInvite(userId, { label: parsed.data.label ?? "" });

  // The token is returned exactly once. It is stored only as a SHA-256, so this
  // response is the single opportunity to copy the link.
  return NextResponse.json({
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
    label: invite.label,
  });
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await currentUserId();
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const invites = await listInvites(userId);

  return NextResponse.json({
    invites: invites.map((i) => ({
      id: i.id,
      label: i.label,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      redeemedAt: i.redeemedAt?.toISOString() ?? null,
      redeemedBy: i.redeemedBy?.username ?? null,
    })),
  });
}
