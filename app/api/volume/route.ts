import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { computeGroupVolume } from "@/lib/db/volume";
import { MUSCLE_GROUPS, verdictForVolume } from "@/lib/muscles";
import { VOLUME_WINDOW_DAYS } from "@/lib/volume";

/** Trailing-window hard-set volume per muscle group, for the progress chart. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const volume = await computeGroupVolume(await currentUserId());

  return NextResponse.json({
    windowDays: VOLUME_WINDOW_DAYS,
    groups: MUSCLE_GROUPS.map((group) => ({
      group,
      sets: volume[group],
      verdict: verdictForVolume(volume[group]),
    })),
  });
}
