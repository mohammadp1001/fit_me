import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/session";
import { currentUserId } from "@/lib/db/current-user";
import { upsertUser } from "@/lib/db/user";
import { installProgram } from "@/lib/db/programs";
import { parseWorkoutYaml } from "@/lib/yaml-parser";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  yamlContent: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { name, weightKg, heightCm, yamlContent } = parsed.data;

  let program;
  try {
    program = parseWorkoutYaml(yamlContent);
  } catch (e) {
    // Surface the parser's message: it names the day, exercise and offending
    // value, which is the only way a user can fix a rejected muscle tag.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid YAML" },
      { status: 400 }
    );
  }

  try {
    const userId = await currentUserId();

    // The upload doubles as onboarding: a brand-new install gets its name,
    // weight and height from the same request.
    await upsertUser(userId, { name, weightKg, heightCm });
    await installProgram(userId, program, yamlContent);
  } catch (e) {
    console.error("[setup] failed:", e);
    return NextResponse.json(
      { error: "Database error", detail: String(e) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
