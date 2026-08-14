/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// The route gates on the session cookie; these tests are about the library
// upsert rules underneath it, so authentication is stubbed as always-passing.
jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
}));

import { POST } from "./route";

const prisma = new PrismaClient();

const MP4 =
  "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-chest-press-side.mp4";
const YT = "https://www.youtube.com/watch?v=YXjhMV7uz4c";

/** Unique per run so parallel/repeat runs never collide on the name key. */
const EX_NAME = `Setup Route Test Press ${Date.now()}`;

function yamlWith(fields: string): string {
  return `
program:
  name: "Setup Route Test Program"
  days:
    - name: "Day 1"
      exercises:
        - name: "${EX_NAME}"
          muscles:
            primary: [pec_major_sternal]
          sets: 3
          reps: 10
${fields}
`;
}

async function upload(yamlContent: string) {
  const request = new NextRequest("http://localhost/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      weightKg: 80,
      heightCm: 180,
      yamlContent,
    }),
  });
  const res = await POST(request);
  expect(res.status).toBe(200);
}

async function libraryRow() {
  const row = await prisma.exercise.findFirst({ where: { nameFa: EX_NAME } });
  if (!row) throw new Error(`library row ${EX_NAME} not found`);
  return row;
}

describe("/api/setup library upsert", () => {
  const createdProgramIds: number[] = [];

  afterEach(async () => {
    // Every upload creates a fresh Program; collect and drop them all so the
    // suite leaves no active program behind for other DB tests.
    const programs = await prisma.program.findMany({
      where: { nameFa: "Setup Route Test Program" },
      select: { id: true },
    });
    createdProgramIds.push(...programs.map((p) => p.id));
  });

  afterAll(async () => {
    const ids = [...new Set(createdProgramIds)];
    const days = await prisma.programDay.findMany({
      where: { programId: { in: ids } },
      select: { id: true },
    });
    await prisma.programExercise.deleteMany({
      where: { dayId: { in: days.map((d) => d.id) } },
    });
    await prisma.programDay.deleteMany({ where: { programId: { in: ids } } });
    await prisma.program.deleteMany({ where: { id: { in: ids } } });
    await prisma.exercise.deleteMany({ where: { nameFa: EX_NAME } });
    await prisma.$disconnect();
  });

  it("stores the video URL when the exercise is new to the library", async () => {
    await upload(yamlWith(`          video: "${YT}"`));
    expect((await libraryRow()).videoUrl).toBe(YT);
  });

  // The bug this file exists for. A library row created by an earlier upload
  // (or the MuscleWiki seed) already had a videoUrl, and the backfill-only
  // rule meant a newer YAML's `video:` was silently discarded — so the Guide
  // tab kept linking to MuscleWiki no matter what the user re-uploaded.
  it("overwrites a stale video URL on re-upload", async () => {
    const row = await libraryRow();
    await prisma.exercise.update({
      where: { id: row.id },
      data: { videoUrl: MP4 },
    });

    await upload(yamlWith(`          video: "${YT}"`));

    expect((await libraryRow()).videoUrl).toBe(YT);
  });

  it("leaves the stored video URL alone when the upload omits `video:`", async () => {
    const row = await libraryRow();
    await prisma.exercise.update({
      where: { id: row.id },
      data: { videoUrl: MP4 },
    });

    await upload(yamlWith(`          description: "no video field here"`));

    expect((await libraryRow()).videoUrl).toBe(MP4);
  });

  // Guards the rule that was deliberately *kept*: prose is still backfill-only,
  // so a terser re-upload cannot blank hand-written guide content.
  it("does not overwrite existing prose on re-upload", async () => {
    const row = await libraryRow();
    await prisma.exercise.update({
      where: { id: row.id },
      data: { descriptionFa: "hand-written original" },
    });

    await upload(yamlWith(`          description: "terser replacement"`));

    expect((await libraryRow()).descriptionFa).toBe("hand-written original");
  });
});
