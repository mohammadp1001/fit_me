/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

// The route gates on the session cookie; these tests are about the library
// upsert rules underneath it, so authentication is stubbed as always-passing.
// `currentUserId()` reads the session, so stubbing "logged in" now means
// stubbing *who*. Account 1 is the one the fixtures below create.
jest.mock("@/lib/session", () => ({
  isAuthenticated: jest.fn(async () => true),
  sessionUserId: jest.fn(async () => 1),
}));

import { POST } from "./route";

const prisma = new PrismaClient();

const MP4 =
  "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-chest-press-side.mp4";
const YT = "https://www.youtube.com/watch?v=YXjhMV7uz4c";

/** Unique per run so parallel/repeat runs never collide on the name key. */
const EX_NAME = `Setup Route Test Press ${Date.now()}`;

function yamlFor(exerciseName: string, fields: string): string {
  return `
program:
  name: "Setup Route Test Program"
  days:
    - name: "Day 1"
      exercises:
        - name: "${exerciseName}"
          muscles:
            primary: [pec_major_sternal]
          sets: 3
          reps: 10
${fields}
`;
}

function yamlWith(fields: string): string {
  return yamlFor(EX_NAME, fields);
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

// #45. The library seed is Persian-named (`nameFa`) with an English `nameEn`.
// Matching on `nameFa` alone meant an English-named YAML could never bind to a
// seeded row, so every upload minted a duplicate: one upload of the 26-exercise
// example program took a freshly seeded library from 29 rows to 55.
describe("/api/setup library lookup by name", () => {
  const FA_NAME = `تست پرس ${Date.now()}`;
  const EN_NAME = `Setup Route Lookup Press ${Date.now()}`;
  const createdProgramIds: number[] = [];
  let seededId: number;

  beforeAll(async () => {
    const row = await prisma.exercise.create({
      data: {
        userId: 1,
        nameFa: FA_NAME,
        nameEn: EN_NAME,
        musclesPrimary: ["pec_major_sternal"],
        videoUrl: MP4,
      },
    });
    seededId = row.id;
  });

  afterEach(async () => {
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
    await prisma.exercise.deleteMany({
      where: { OR: [{ nameFa: FA_NAME }, { nameFa: EN_NAME }] },
    });
    await prisma.$disconnect();
  });

  it("binds an English YAML name to the existing Persian-named row", async () => {
    await upload(yamlFor(EN_NAME, `          video: "${YT}"`));

    const matches = await prisma.exercise.findMany({
      where: { OR: [{ nameFa: FA_NAME }, { nameFa: EN_NAME }] },
    });

    // The point of the fix: one row, not two.
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(seededId);
    expect(matches[0].nameFa).toBe(FA_NAME);
    expect(matches[0].videoUrl).toBe(YT);
  });

  it("still matches on the Persian name, which stays the canonical key", async () => {
    await upload(yamlFor(FA_NAME, `          video: "${MP4}"`));

    const matches = await prisma.exercise.findMany({
      where: { OR: [{ nameFa: FA_NAME }, { nameFa: EN_NAME }] },
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(seededId);
    expect(matches[0].videoUrl).toBe(MP4);
  });

  it("picks the lowest id when several rows share a nameEn", async () => {
    // `nameEn` is not unique, so the fallback must be deterministic - otherwise
    // a program can silently rebind to a different row between uploads.
    const second = await prisma.exercise.create({
      data: {
        userId: 1,
        nameFa: `${FA_NAME} duplicate`,
        nameEn: EN_NAME,
        musclesPrimary: ["pec_major_sternal"],
      },
    });

    await upload(yamlFor(EN_NAME, `          video: "${YT}"`));

    const winner = await prisma.exercise.findUnique({ where: { id: seededId } });
    const loser = await prisma.exercise.findUnique({ where: { id: second.id } });
    expect(winner!.videoUrl).toBe(YT);
    expect(loser!.videoUrl).toBe("");

    await prisma.programExercise.deleteMany({ where: { exerciseId: second.id } });
    await prisma.exercise.delete({ where: { id: second.id } });
  });
});
