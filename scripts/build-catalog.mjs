/**
 * Regenerates `prisma/catalog/exercises.json` from free-exercise-db.
 *
 *   node scripts/build-catalog.mjs
 *
 * The generated file is checked in, and the seed reads only that - this script
 * is never run at build or deploy time. Two reasons: the catalog must not
 * change because an upstream repository changed under us, and a deploy must not
 * depend on a third-party URL being reachable.
 *
 * Source: https://github.com/yuhonas/free-exercise-db (Unlicense, public
 * domain, no attribution required).
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

/**
 * Categories that fit a sets x reps log.
 *
 * Stretching, cardio, plyometrics and strongman are excluded: the program
 * format and the hard-set volume model both assume sets and reps, and a stretch
 * logged as "3 x 10 at 0kg" would count toward weekly volume as though it were
 * training.
 */
const CATEGORIES = new Set(["strength", "powerlifting", "olympic weightlifting"]);

/**
 * The upstream vocabulary is 17 coarse names; ours is 30 fine-grained muscles.
 * Coarse to fine cannot be done faithfully, so each maps to the *single* muscle
 * that best represents it rather than to every muscle it might involve.
 *
 * Tagging conservatively keeps per-muscle reads honest: "chest" in the source
 * does not distinguish an incline press from a flat one, so claiming both heads
 * of the pec would be inventing detail the source does not have. Volume is
 * unaffected either way - a set counts once per muscle *group*, and every
 * candidate for a given source name lives in the same group.
 *
 * `neck` has no equivalent in our vocabulary. Exercises that name it are
 * dropped rather than mapped to something adjacent.
 */
const MUSCLE_MAP = {
  chest: "pec_major_sternal",
  shoulders: "side_delt",
  lats: "lats",
  "middle back": "rhomboids",
  "lower back": "erector_spinae",
  traps: "traps_upper",
  biceps: "biceps_brachii",
  triceps: "triceps_brachii",
  forearms: "forearm_flexors",
  abdominals: "rectus_abdominis",
  quadriceps: "quadriceps",
  hamstrings: "hamstrings",
  glutes: "glute_max",
  abductors: "glute_med",
  adductors: "adductors",
  calves: "gastrocnemius",
  neck: null,
};

/** `Barbell Bench Press - Medium Grip` -> `barbell_bench_press_medium_grip`. */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mapMuscles(names) {
  const mapped = [];
  for (const name of names ?? []) {
    if (!(name in MUSCLE_MAP)) {
      throw new Error(`Unknown source muscle "${name}" - update MUSCLE_MAP.`);
    }
    const muscle = MUSCLE_MAP[name];
    if (muscle && !mapped.includes(muscle)) mapped.push(muscle);
  }
  return mapped;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Source fetch failed: ${response.status}`);
const source = await response.json();

const bySlug = new Map();
let droppedCategory = 0;
let droppedNeck = 0;
let droppedNoMuscle = 0;
let droppedDuplicate = 0;

for (const entry of source) {
  if (!CATEGORIES.has(entry.category)) {
    droppedCategory++;
    continue;
  }

  const all = [...(entry.primaryMuscles ?? []), ...(entry.secondaryMuscles ?? [])];
  if (all.includes("neck")) {
    droppedNeck++;
    continue;
  }

  const musclesPrimary = mapMuscles(entry.primaryMuscles);
  if (musclesPrimary.length === 0) {
    // An exercise with no primary muscle cannot contribute to volume, so it
    // would be dead weight in the library.
    droppedNoMuscle++;
    continue;
  }

  const musclesSecondary = mapMuscles(entry.secondaryMuscles).filter(
    (m) => !musclesPrimary.includes(m),
  );

  const slug = toSlug(entry.name);
  if (bySlug.has(slug)) {
    droppedDuplicate++;
    continue;
  }

  bySlug.set(slug, {
    slug,
    name: entry.name,
    musclesPrimary,
    musclesSecondary,
    // The source gives ordered steps, not prose. Joined into a paragraph
    // because that is what the exercise screen renders.
    description: (entry.instructions ?? []).join(" "),
    equipment: entry.equipment ?? "",
    // Kept because they are genuinely useful filters when choosing a
    // substitute lift, and free to carry.
    level: entry.level ?? "",
    mechanic: entry.mechanic ?? "",
    force: entry.force ?? "",
  });
}

// Hand-curated entries, merged on top of the import.
//
// These came from the seed library the app shipped before the catalog existed:
// gym-machine movements the upstream source does not carry, with tips, common
// mistakes and video links nobody generated - they were written by hand. They
// live in their own checked-in file so regenerating from upstream cannot
// silently drop them.
const curated = JSON.parse(readFileSync("prisma/catalog/curated.json", "utf8"));
let curatedAdded = 0;
for (const entry of curated) {
  if (bySlug.has(entry.slug)) continue;
  bySlug.set(entry.slug, entry);
  curatedAdded++;
}

const catalog = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

writeFileSync(
  "prisma/catalog/exercises.json",
  JSON.stringify(catalog, null, 2) + "\n",
  "utf8",
);

console.log(`source            ${source.length}`);
console.log(`dropped category  ${droppedCategory}`);
console.log(`dropped neck      ${droppedNeck}`);
console.log(`dropped no muscle ${droppedNoMuscle}`);
console.log(`dropped duplicate ${droppedDuplicate}`);
console.log(`curated added     ${curatedAdded}`);
console.log(`written           ${catalog.length}`);
