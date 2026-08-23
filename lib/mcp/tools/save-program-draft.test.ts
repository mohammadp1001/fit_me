/**
 * @jest-environment node
 */
import { PrismaClient } from "@prisma/client";
import { DraftRejected, saveProgramDraft } from "./save-program-draft";
import {
  activateProgram,
  discardDraft,
  findDraft,
  getActiveProgram,
  installProgram,
  listPrograms,
} from "@/lib/db/programs";
import { parseWorkoutYaml } from "@/lib/yaml-parser";
import { listPrograms as listProgramsTool } from "./read-tools";

const prisma = new PrismaClient();

const TAG = Date.now();
let userId: number;

const yamlFor = (name: string, slug = "barbell_squat") => `
program:
  name: "${name}"
  days:
    - name: "Day 1"
      exercises:
        - exercise: ${slug}
          sets: 3
          reps: 10
`;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: "Draft Tester",
      username: `draft-${TAG}`,
      passwordHash: "x",
      weightKg: 80,
      heightCm: 180,
    },
  });
  userId = user.id;

  if ((await prisma.exerciseCatalog.count()) === 0) {
    throw new Error("Catalog is empty - run `npm run db:seed-catalog` first.");
  }
});

/** The program the user is actually following before any proposal arrives. */
async function installActive(name: string) {
  const yaml = yamlFor(name);
  return installProgram(userId, parseWorkoutYaml(yaml), yaml);
}

afterEach(async () => {
  const programs = await prisma.program.findMany({
    where: { userId },
    select: { id: true },
  });
  const ids = programs.map((p) => p.id);
  const days = await prisma.programDay.findMany({
    where: { programId: { in: ids } },
    select: { id: true },
  });
  await prisma.programExercise.deleteMany({
    where: { dayId: { in: days.map((d) => d.id) } },
  });
  await prisma.programDay.deleteMany({ where: { programId: { in: ids } } });
  await prisma.program.deleteMany({ where: { id: { in: ids } } });
  await prisma.exercise.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("save_program_draft never changes what the user is following", () => {
  it("leaves the active program active", async () => {
    const active = await installActive(`Current ${TAG}`);

    const result = await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "Your chest volume has been low for three weeks.",
    });

    expect(result.status).toBe("awaiting approval");

    const stillActive = await getActiveProgram(userId);
    expect(stillActive!.id).toBe(active.id);
    expect(stillActive!.name).toBe(`Current ${TAG}`);
  });

  it("stores the draft as inactive, with its rationale", async () => {
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });

    const draft = await findDraft(userId);
    expect(draft).not.toBeNull();
    expect(draft!.isActive).toBe(false);
    expect(draft!.isDraft).toBe(true);
    expect(draft!.rationale).toBe("More chest volume.");
    // A draft is a real program, so the approval screen can diff it.
    expect(draft!.days[0].exercises).toHaveLength(1);
  });

  // Showing a proposal in the switcher would be a second, unguarded way to
  // activate it.
  it("keeps the draft out of the program switcher", async () => {
    await installActive(`Current ${TAG}`);
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });

    const listed = await listPrograms(userId);
    expect(listed.map((p) => p.name)).toEqual([`Current ${TAG}`]);

    const viaTool = await listProgramsTool({ userId });
    expect(viaTool.programs.map((p) => p.name)).toEqual([`Current ${TAG}`]);
  });

  // There is deliberately no argument that activates.
  it("has no way to activate, so approval stays in the app", async () => {
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });

    expect(
      await prisma.program.count({ where: { userId, isActive: true } }),
    ).toBe(0);
  });
});

describe("save_program_draft refuses rather than damaging anything", () => {
  it("requires a rationale", async () => {
    await expect(
      saveProgramDraft({
        userId,
        yaml: yamlFor(`Proposed ${TAG}`),
        rationale: "   ",
      }),
    ).rejects.toThrow(/needs a rationale/);
  });

  it("rejects YAML that does not parse, saving nothing", async () => {
    await expect(
      saveProgramDraft({
        userId,
        yaml: "program:\n  name: x\n  days: [",
        rationale: "why",
      }),
    ).rejects.toThrow(DraftRejected);

    expect(await prisma.program.count({ where: { userId } })).toBe(0);
  });

  it("rejects an unknown exercise slug and says the active program is safe", async () => {
    const active = await installActive(`Current ${TAG}`);

    await expect(
      saveProgramDraft({
        userId,
        yaml: yamlFor(`Proposed ${TAG}`, "not_a_real_slug"),
        rationale: "why",
      }),
    ).rejects.toThrow(/active program is unchanged/);

    expect((await getActiveProgram(userId))!.id).toBe(active.id);
    expect(await findDraft(userId)).toBeNull();
  });
});

describe("save_program_draft will not silently discard a pending proposal", () => {
  async function propose(name: string, replaceExisting?: boolean) {
    return saveProgramDraft({
      userId,
      yaml: yamlFor(name),
      rationale: `Reason for ${name}`,
      ...(replaceExisting === undefined ? {} : { replaceExisting }),
    });
  }

  it("refuses a second proposal by default, naming the first", async () => {
    await propose(`First ${TAG}`);

    await expect(propose(`Second ${TAG}`)).rejects.toThrow(
      new RegExp(`already a proposal waiting.*First ${TAG}`),
    );

    // The first is still the one waiting.
    expect((await findDraft(userId))!.name).toBe(`First ${TAG}`);
  });

  it("replaces the first only when told to, and says so", async () => {
    await propose(`First ${TAG}`);
    const result = await propose(`Second ${TAG}`, true);

    expect(result.replacedPreviousDraft).toBe(true);
    expect((await findDraft(userId))!.name).toBe(`Second ${TAG}`);
    expect(
      await prisma.program.count({ where: { userId, isDraft: true } }),
    ).toBe(1);
  });
});

describe("approving and discarding a draft", () => {
  it("approving makes it the active program and no longer a draft", async () => {
    const active = await installActive(`Current ${TAG}`);
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });
    const draft = (await findDraft(userId))!;

    await activateProgram(userId, draft.id);

    const nowActive = await getActiveProgram(userId);
    expect(nowActive!.id).toBe(draft.id);
    expect(nowActive!.isDraft).toBe(false);
    expect(await findDraft(userId)).toBeNull();

    // The previous program is retired, not deleted - its logs still point at it.
    const previous = await prisma.program.findUniqueOrThrow({
      where: { id: active.id },
    });
    expect(previous.isActive).toBe(false);
  });

  it("discarding removes it and leaves the active program alone", async () => {
    const active = await installActive(`Current ${TAG}`);
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });
    const draft = (await findDraft(userId))!;

    expect(await discardDraft(userId, draft.id)).toBe(true);

    expect(await findDraft(userId)).toBeNull();
    expect((await getActiveProgram(userId))!.id).toBe(active.id);
  });

  it("will not discard another account's draft", async () => {
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });
    const draft = (await findDraft(userId))!;

    const other = await prisma.user.create({
      data: {
        name: "Other",
        username: `draft-other-${TAG}`,
        passwordHash: "x",
        weightKg: 70,
        heightCm: 170,
      },
    });
    try {
      expect(await discardDraft(other.id, draft.id)).toBe(false);
      expect(await findDraft(userId)).not.toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it("will not let another account see the draft", async () => {
    await saveProgramDraft({
      userId,
      yaml: yamlFor(`Proposed ${TAG}`),
      rationale: "More chest volume.",
    });

    const other = await prisma.user.create({
      data: {
        name: "Other",
        username: `draft-peek-${TAG}`,
        passwordHash: "x",
        weightKg: 70,
        heightCm: 170,
      },
    });
    try {
      expect(await findDraft(other.id)).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
