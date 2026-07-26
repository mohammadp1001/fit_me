import { Muscle } from "@prisma/client";

/**
 * Coarse muscle groups. Volume landmarks in the training literature are stated
 * per group per week, not per individual muscle, so this is the granularity all
 * analytics roll up to. The `Muscle` enum stays fine-grained for display and for
 * feeding the coach precise anatomy.
 */
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "calves",
  "core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * Fine-grained muscle -> coarse group. `Record` (not `Partial<Record>`) is
 * deliberate: adding a `Muscle` member without assigning it a group is a
 * compile error rather than a silent hole in every volume calculation.
 */
export const MUSCLE_GROUP: Record<Muscle, MuscleGroup> = {
  pec_major_clavicular: "chest",
  pec_major_sternal: "chest",

  lats: "back",
  traps_upper: "back",
  traps_middle: "back",
  traps_lower: "back",
  rhomboids: "back",
  teres_major: "back",
  erector_spinae: "back",

  front_delt: "shoulders",
  side_delt: "shoulders",
  rear_delt: "shoulders",
  // Scapular protractor - grouped with the shoulder girdle rather than chest.
  serratus_anterior: "shoulders",

  biceps_brachii: "arms",
  brachialis: "arms",
  triceps_brachii: "arms",

  brachioradialis: "forearms",
  forearm_flexors: "forearms",
  forearm_extensors: "forearms",

  quadriceps: "quads",
  hamstrings: "hamstrings",
  glute_max: "glutes",
  glute_med: "glutes",
  adductors: "adductors",
  gastrocnemius: "calves",
  soleus: "calves",
  tibialis_anterior: "calves",

  rectus_abdominis: "core",
  obliques: "core",
  hip_flexors: "core",
};

/** Bilingual display labels. Same `Record` exhaustiveness guarantee as above. */
export const MUSCLE_LABEL: Record<Muscle, { fa: string; en: string }> = {
  pec_major_clavicular: { fa: "سینه بالایی", en: "Upper Chest" },
  pec_major_sternal: { fa: "سینه", en: "Chest" },

  lats: { fa: "پشتی بزرگ", en: "Lats" },
  traps_upper: { fa: "ذوزنقه بالایی", en: "Upper Traps" },
  traps_middle: { fa: "ذوزنقه میانی", en: "Mid Traps" },
  traps_lower: { fa: "ذوزنقه پایینی", en: "Lower Traps" },
  rhomboids: { fa: "لوزی", en: "Rhomboids" },
  teres_major: { fa: "گرد بزرگ", en: "Teres Major" },
  erector_spinae: { fa: "راست‌کننده ستون فقرات", en: "Erector Spinae" },

  front_delt: { fa: "دلتوئید جلو", en: "Front Delt" },
  side_delt: { fa: "دلتوئید میانی", en: "Side Delt" },
  rear_delt: { fa: "دلتوئید خلفی", en: "Rear Delt" },
  serratus_anterior: { fa: "دندانه‌ای جلو", en: "Serratus Anterior" },

  biceps_brachii: { fa: "دو سر بازو", en: "Biceps" },
  brachialis: { fa: "براکیالیس", en: "Brachialis" },
  triceps_brachii: { fa: "سه سر بازو", en: "Triceps" },

  brachioradialis: { fa: "براکیورادیالیس", en: "Brachioradialis" },
  forearm_flexors: { fa: "خم‌کننده ساعد", en: "Forearm Flexors" },
  forearm_extensors: { fa: "بازکننده ساعد", en: "Forearm Extensors" },

  quadriceps: { fa: "چهار سر ران", en: "Quadriceps" },
  hamstrings: { fa: "همسترینگ", en: "Hamstrings" },
  glute_max: { fa: "سرینی بزرگ", en: "Glute Max" },
  glute_med: { fa: "سرینی میانی", en: "Glute Med" },
  adductors: { fa: "نزدیک‌کننده ران", en: "Adductors" },
  gastrocnemius: { fa: "دوقلو ساق", en: "Gastrocnemius" },
  soleus: { fa: "نعلی (سولئوس)", en: "Soleus" },
  tibialis_anterior: { fa: "درشت‌نی قدامی", en: "Tibialis Anterior" },

  rectus_abdominis: { fa: "شکم راست", en: "Abs" },
  obliques: { fa: "مورب شکمی", en: "Obliques" },
  hip_flexors: { fa: "خم‌کننده لگن", en: "Hip Flexors" },
};

/** Bilingual labels for the coarse groups (used by the volume chart). */
export const MUSCLE_GROUP_LABEL: Record<MuscleGroup, { fa: string; en: string }> = {
  chest: { fa: "سینه", en: "Chest" },
  back: { fa: "پشت", en: "Back" },
  shoulders: { fa: "سرشانه", en: "Shoulders" },
  arms: { fa: "بازو", en: "Arms" },
  forearms: { fa: "ساعد", en: "Forearms" },
  quads: { fa: "چهارسر", en: "Quads" },
  hamstrings: { fa: "همسترینگ", en: "Hamstrings" },
  glutes: { fa: "سرینی", en: "Glutes" },
  adductors: { fa: "نزدیک‌کننده", en: "Adductors" },
  calves: { fa: "ساق پا", en: "Calves" },
  core: { fa: "مرکزی", en: "Core" },
};

/** All canonical muscle keys, as a plain array. */
export const ALL_MUSCLES = Object.keys(MUSCLE_GROUP) as Muscle[];

/**
 * How much one logged set counts toward a muscle, by role. A set trains its
 * primary movers fully and its secondary movers partially; 0.5 is the common
 * convention. Kept here as a single named constant so it is tunable in one
 * place once there are enough real logs to calibrate against.
 */
export const PRIMARY_SET_WEIGHT = 1;
export const SECONDARY_SET_WEIGHT = 0.5;

/**
 * Weekly hard-set landmarks per muscle group. Roughly the range the hypertrophy
 * literature converges on; used to turn a bare count into a verdict for both the
 * progress chart and the coaching prompt.
 */
export const WEEKLY_SET_FLOOR = 10;
export const WEEKLY_SET_CEILING = 20;

export type VolumeVerdict = "low" | "adequate" | "high";

export function verdictForVolume(sets: number): VolumeVerdict {
  if (sets < WEEKLY_SET_FLOOR) return "low";
  if (sets > WEEKLY_SET_CEILING) return "high";
  return "adequate";
}

export function isMuscle(value: string): value is Muscle {
  return Object.prototype.hasOwnProperty.call(MUSCLE_GROUP, value);
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

/**
 * Best-guess canonical key for an unrecognised value, so upload errors can say
 * "did you mean ...?" instead of dumping the whole enum. Matches against the
 * keys and both display labels; returns null when nothing is close enough.
 */
export function suggestMuscle(input: string): Muscle | null {
  const needle = input.trim().toLowerCase();
  if (!needle) return null;

  let best: Muscle | null = null;
  let bestScore = Infinity;

  for (const muscle of ALL_MUSCLES) {
    const candidates = [
      muscle.toLowerCase(),
      muscle.replace(/_/g, " ").toLowerCase(),
      MUSCLE_LABEL[muscle].en.toLowerCase(),
      MUSCLE_LABEL[muscle].fa,
    ];
    for (const candidate of candidates) {
      const score = editDistance(needle, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = muscle;
      }
    }
  }

  // Beyond roughly half the input length the "suggestion" is noise.
  return bestScore <= Math.max(3, Math.ceil(needle.length / 2)) ? best : null;
}
