import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { getActiveProgram } from "@/lib/db/programs";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const program = await getActiveProgram(await currentUserId());

  return NextResponse.json({ program });
}
