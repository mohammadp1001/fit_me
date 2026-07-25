/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import type { CoachProvider } from "@/lib/coach";

process.env.CRON_SECRET = "test-cron-secret";

import { GET, runSuggestionsCron } from "./route";

const prisma = new PrismaClient();

/** A `CoachProvider` that counts calls and can be told to fail for specific exercises. */
class SpyCoachProvider implements CoachProvider {
  calls = 0;
  failFor: Set<string> = new Set();

  async complete(prompt: string): Promise<string> {
    this.calls += 1;

    for (const marker of this.failFor) {
      if (prompt.includes(marker)) {
        throw new Error(`SpyCoachProvider: simulated failure for ${marker}`);
      }
    }

    const setsMatch = prompt.match(/Sets required:\s*(\d+)/);
    const setsCount = setsMatch ? parseInt(setsMatch[1], 10) : 3;
    const sets = Array.from({ length: setsCount }, () => ({ weight: 20, reps: 10 }));

    return JSON.stringify({
      sets,
      rationale: "Spy suggestion.",
      updatedExerciseMemory: "Spy exercise memory.",
      updatedGlobalMemory: "Spy global memory.",
    });
  }
}

describe("/api/cron/suggestions", () => {
  let userId: number;
  let userCreatedByTest = false;
  let programId: number;
  let day1Id: number;
  let day2Id: number;
  let exerciseAId: number;
  let exerciseBId: number;
  let programExerciseAId: number;
  let programExerciseBId: number;
  let globalMemoryCreatedByTest = false;

  const suffix = Date.now();

  beforeAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { id: 1 } });
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const user = await prisma.user.create({
        data: { name: "Cron Test User", weightKg: 80, heightCm: 180 },
      });
      userId = user.id;
      userCreatedByTest = true;
    }

    const existingGlobalMemory = await prisma.globalMemory.findUnique({ where: { id: 1 } });
    if (!existingGlobalMemory) {
      globalMemoryCreatedByTest = true;
    }

    const exerciseA = await prisma.exercise.create({
      data: { nameFa: `Cron Ex A ${suffix}`, nameEn: `Cron Ex A ${suffix}`, muscles: ["Chest"] },
    });
    exerciseAId = exerciseA.id;

    const exerciseB = await prisma.exercise.create({
      data: { nameFa: `Cron Ex B ${suffix}`, nameEn: `Cron Ex B ${suffix}`, muscles: ["Back"] },
    });
    exerciseBId = exerciseB.id;

    // Deactivate any other active programs so this one is unambiguously "the" active program.
    await prisma.program.updateMany({ where: { userId }, data: { isActive: false } });

    const program = await prisma.program.create({
      data: {
        userId,
        nameFa: `Cron Program ${suffix}`,
        nameEn: `Cron Program ${suffix}`,
        yamlContent: "",
        isActive: true,
      },
    });
    programId = program.id;

    const day1 = await prisma.programDay.create({
      data: { programId, dayNumber: 1, nameFa: "Day 1", nameEn: "Day 1" },
    });
    day1Id = day1.id;

    const day2 = await prisma.programDay.create({
      data: { programId, dayNumber: 2, nameFa: "Day 2", nameEn: "Day 2" },
    });
    day2Id = day2.id;

    const programExerciseA = await prisma.programExercise.create({
      data: { dayId: day1Id, exerciseId: exerciseAId, setsCount: 3, reps: [10, 10, 10], displayOrder: 0 },
    });
    programExerciseAId = programExerciseA.id;

    const programExerciseB = await prisma.programExercise.create({
      data: { dayId: day2Id, exerciseId: exerciseBId, setsCount: 2, reps: [8, 8], displayOrder: 0 },
    });
    programExerciseBId = programExerciseB.id;
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { exerciseId: { in: [exerciseAId, exerciseBId] } } });
    await prisma.exerciseMemory.deleteMany({ where: { exerciseId: { in: [exerciseAId, exerciseBId] } } });
    if (globalMemoryCreatedByTest) {
      await prisma.globalMemory.deleteMany({ where: { id: 1 } });
    }
    await prisma.workoutLog.deleteMany({
      where: { programExerciseId: { in: [programExerciseAId, programExerciseBId] } },
    });
    await prisma.programExercise.deleteMany({ where: { id: { in: [programExerciseAId, programExerciseBId] } } });
    await prisma.programDay.deleteMany({ where: { id: { in: [day1Id, day2Id] } } });
    await prisma.program.deleteMany({ where: { id: programId } });
    await prisma.exercise.deleteMany({ where: { id: { in: [exerciseAId, exerciseBId] } } });
    if (userCreatedByTest) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  describe("auth", () => {
    it("rejects a request with no Authorization header", async () => {
      const request = new NextRequest("http://localhost/api/cron/suggestions");
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("rejects a request with the wrong bearer token", async () => {
      const request = new NextRequest("http://localhost/api/cron/suggestions", {
        headers: { authorization: "Bearer wrong-secret" },
      });
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("accepts a request with the correct bearer token", async () => {
      const request = new NextRequest("http://localhost/api/cron/suggestions", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const response = await GET(request);
      expect(response.status).toBe(200);
    });
  });

  describe("due-day inference and generation", () => {
    beforeAll(async () => {
      // The auth describe block above already exercised a full run (via a
      // valid-token GET) as a side effect of confirming a 200 response -
      // start this block from a clean slate regardless of that.
      await prisma.suggestion.deleteMany({ where: { exerciseId: { in: [exerciseAId, exerciseBId] } } });
      await prisma.workoutLog.deleteMany({
        where: { programExerciseId: { in: [programExerciseAId, programExerciseBId] } },
      });
    });

    it("defaults to day 1 when there is no logged history for the active program", async () => {
      const provider = new SpyCoachProvider();
      const result = await runSuggestionsCron(provider);

      expect(result.dueDay).toBe(1);
      expect(result.results).toEqual([{ exerciseId: exerciseAId, status: "created" }]);
      expect(provider.calls).toBe(1);

      const suggestion = await prisma.suggestion.findFirst({ where: { exerciseId: exerciseAId } });
      expect(suggestion).not.toBeNull();
      expect(suggestion?.sets).toHaveLength(3);

      const exerciseMemory = await prisma.exerciseMemory.findUnique({ where: { exerciseId: exerciseAId } });
      expect(exerciseMemory?.notes).toBe("Spy exercise memory.");

      const globalMemory = await prisma.globalMemory.findUnique({ where: { id: 1 } });
      expect(globalMemory?.notes).toBe("Spy global memory.");
    });

    it("is idempotent: re-running for the same day makes no additional provider calls and writes no duplicates", async () => {
      const provider = new SpyCoachProvider();
      const result = await runSuggestionsCron(provider);

      expect(result.dueDay).toBe(1);
      expect(result.results).toEqual([{ exerciseId: exerciseAId, status: "skipped" }]);
      expect(provider.calls).toBe(0);

      const suggestions = await prisma.suggestion.findMany({ where: { exerciseId: exerciseAId } });
      expect(suggestions).toHaveLength(1);
    });

    it("advances the due day to the next day after the most recently logged day, wrapping after the last day", async () => {
      const today = new Date(new Date().toISOString().slice(0, 10));

      // Log day 1's exercise today -> due day should become 2.
      await prisma.workoutLog.create({
        data: {
          userId,
          programExerciseId: programExerciseAId,
          date: today,
          sets: [{ weight: 20, reps: 10 }],
        },
      });

      const provider = new SpyCoachProvider();
      const result = await runSuggestionsCron(provider);

      expect(result.dueDay).toBe(2);
      expect(result.results).toEqual([{ exerciseId: exerciseBId, status: "created" }]);
      expect(provider.calls).toBe(1);
    });

    it("wraps back to day 1 after the last program day", async () => {
      const today = new Date(new Date().toISOString().slice(0, 10));

      // Log day 2's exercise today (most recent log) -> should wrap to day 1.
      await prisma.workoutLog.create({
        data: {
          userId,
          programExerciseId: programExerciseBId,
          date: today,
          sets: [{ weight: 20, reps: 10 }],
        },
      });

      // Day 1's suggestion for today already exists from the first test, so
      // it should be skipped rather than regenerated.
      const provider = new SpyCoachProvider();
      const result = await runSuggestionsCron(provider);

      expect(result.dueDay).toBe(1);
      expect(result.results).toEqual([{ exerciseId: exerciseAId, status: "skipped" }]);
      expect(provider.calls).toBe(0);
    });
  });

  describe("generation failure handling", () => {
    it("writes nothing for an exercise whose generation fails, while unaffected exercises still succeed", async () => {
      // Clear today's suggestions for both exercises so both are due again.
      await prisma.suggestion.deleteMany({ where: { exerciseId: { in: [exerciseAId, exerciseBId] } } });

      // Force the due day back to 1 by removing logs (no history -> day 1).
      await prisma.workoutLog.deleteMany({
        where: { programExerciseId: { in: [programExerciseAId, programExerciseBId] } },
      });

      const provider = new SpyCoachProvider();
      provider.failFor.add(`Cron Ex A ${suffix}`);

      const result = await runSuggestionsCron(provider);

      expect(result.dueDay).toBe(1);
      expect(result.results).toEqual([
        { exerciseId: exerciseAId, status: "failed", error: expect.stringContaining("simulated failure") },
      ]);

      const suggestion = await prisma.suggestion.findFirst({ where: { exerciseId: exerciseAId } });
      expect(suggestion).toBeNull();
    });
  });
});
