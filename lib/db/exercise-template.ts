import { Muscle } from "@prisma/client";
import { prisma } from "../prisma.ts";

/**
 * The template exercise library.
 *
 * Lives here rather than in `prisma/seed.ts` because account creation imports
 * it: every new account gets its own copy of these rows (#59), and importing
 * the seed script would have executed the seed as a side effect.
 */

const exercises = [
  {
    name: "Machine Chest Press",
    musclesPrimary: ["pec_major_sternal"] as Muscle[],
    musclesSecondary: ["triceps_brachii", "front_delt"] as Muscle[],
    description:
      "Sit on the machine seat. Keep your back fully against the pad. Grip the handles at mid-chest level. Press forward until elbows are nearly straight — don't lock out. Return under control.",
    tips: [
      "Adjust the seat so handles are at mid-chest level",
      "Keep your back against the pad throughout",
      "Controlled lowering = more tension",
    ],
    mistakes: ["Seat too high or too low", "Locking out elbows", "Back coming off the pad"],
    wikiUrl: "https://musclewiki.com/exercise/machine-chest-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-chest-press-side.mp4",
  },
  {
    name: "Dumbbell Incline Press",
    musclesPrimary: ["pec_major_clavicular"] as Muscle[],
    musclesSecondary: ["front_delt", "triceps_brachii"] as Muscle[],
    description:
      "Set bench to 30-45 degrees. Hold dumbbells at upper chest level. Press up and bring dumbbells slightly together at the top.",
    tips: [
      "Don't exceed 45-degree angle",
      "Pause one second at the top",
      "Keep your back flat against the bench",
    ],
    mistakes: ["Too steep an angle (becomes a shoulder press)", "Dropping the dumbbells at the bottom"],
    wikiUrl: "https://musclewiki.com/dumbbells/male/chest",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-incline-press-side.mp4",
  },
  {
    name: "Machine Pec Deck",
    musclesPrimary: ["pec_major_sternal"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Sit on the machine. Keep your back against the pad. Bring the handles together as if hugging something. Pause for one second at the closed position.",
    tips: ["Elbows should be at shoulder level", "Control the opening phase"],
    mistakes: ["Elbows too extended (joint stress)", "Shrugging the shoulders"],
    wikiUrl: "https://musclewiki.com/exercise/machine-chest-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-pec-deck-side.mp4",
  },
  {
    name: "Cable Lower Chest Press",
    musclesPrimary: ["pec_major_sternal"] as Muscle[],
    musclesSecondary: ["triceps_brachii"] as Muscle[],
    description:
      "Grab the handles from high pulleys. Lean slightly forward. Push hands downward and inward. Hands meet below the chest at the bottom.",
    tips: ["Keep torso stable", "Movement only from the shoulder joint"],
    mistakes: ["Excessive trunk lean", "Pulling handles with bent elbows"],
    wikiUrl: "https://musclewiki.com/exercise/cable-pec-fly",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-pec-fly-side.mp4",
  },
  {
    name: "Parallel Bar Dips",
    musclesPrimary: ["pec_major_sternal", "triceps_brachii"] as Muscle[],
    musclesSecondary: ["front_delt"] as Muscle[],
    description:
      "Support yourself between parallel bars. Lean slightly forward. Lower until elbows reach 90 degrees. Push back up without locking elbows.",
    tips: ["Leaning forward = more chest, upright = more triceps", "Cross your feet behind you"],
    mistakes: ["Going too deep", "Swinging the body upward"],
    wikiUrl: "https://musclewiki.com/exercises/triceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Bodyweight-dip-side.mp4",
  },
  {
    name: "Incline Alternating Dumbbell Curl",
    musclesPrimary: ["biceps_brachii"] as Muscle[],
    musclesSecondary: ["brachialis"] as Muscle[],
    description:
      "Set bench to 60-70 degrees. Curl one arm while the other hangs. Supinate the wrist at the top.",
    tips: ["Keep elbows fixed — only forearm moves", "Pause and squeeze at the top for one second"],
    mistakes: ["Body swinging", "Elbows swinging forward"],
    wikiUrl: "https://musclewiki.com/exercises/biceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-incline-bicep-curl-side.mp4",
  },
  {
    name: "Machine Preacher Curl",
    musclesPrimary: ["biceps_brachii"] as Muscle[],
    musclesSecondary: ["brachialis", "brachioradialis"] as Muscle[],
    description:
      "Sit on the machine. Keep elbows fixed on the pad. Curl the handle up until biceps are fully contracted. Lower slowly to feel the stretch.",
    tips: [
      "Keep elbows fully on the pad",
      "Slow lowering = more growth",
      "Pause one second at the top",
    ],
    mistakes: ["Elbows lifting off the pad", "Dropping the weight suddenly", "Shoulder swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-plate-loaded-preacher-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-plate-loaded-preacher-curl-side.mp4",
  },
  {
    name: "Close-Grip Cable Bicep Curl",
    musclesPrimary: ["biceps_brachii"] as Muscle[],
    musclesSecondary: ["brachialis"] as Muscle[],
    description:
      "Attach a short bar to the low cable. Grip with both hands close together. Curl up until arms are fully contracted.",
    tips: ["Constant cable tension = more pressure throughout range of motion"],
    mistakes: ["Leaning body back for assistance"],
    wikiUrl: "https://musclewiki.com/exercise/cable-bar-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-bar-curl-side.mp4",
  },
  {
    name: "Cable Reverse Bicep Curl",
    musclesPrimary: ["brachioradialis"] as Muscle[],
    musclesSecondary: ["forearm_extensors", "biceps_brachii"] as Muscle[],
    description:
      "Like a cable curl but grip with palms facing down (pronated). Works more forearm.",
    tips: ["Use lighter weight than regular curls"],
    mistakes: ["Bending the wrist during the movement"],
    wikiUrl: "https://musclewiki.com/exercises/biceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-reverse-bicep-curl-side.mp4",
  },
  {
    name: "Wide-Stance Leg Press",
    musclesPrimary: ["quadriceps", "glute_max"] as Muscle[],
    musclesSecondary: ["hamstrings", "adductors"] as Muscle[],
    description:
      "Lie on the machine. Place feet wider than shoulder-width apart. Toes slightly out. Bend knees to 90 degrees. Press without locking knees.",
    tips: ["Wide stance = more glutes and inner thigh", "Keep lower back pressed to the seat"],
    mistakes: ["Locking knees at the top", "Hips coming off the seat"],
    wikiUrl: "https://musclewiki.com/exercise/machine-leg-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-leg-press-side.mp4",
  },
  {
    name: "Wide-Stance Hack Squat",
    musclesPrimary: ["quadriceps", "glute_max"] as Muscle[],
    musclesSecondary: ["hamstrings", "adductors"] as Muscle[],
    description:
      "Position yourself under the hack squat machine. Feet wider than shoulders. Lower until thighs are parallel to the floor or below.",
    tips: ["Keep gaze forward and slightly up", "Knees should track over toes"],
    mistakes: ["Knees caving inward", "Heels lifting off the platform"],
    wikiUrl: "https://musclewiki.com/exercise/machine-leg-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-hack-squat-side.mp4",
  },
  {
    name: "Machine Leg Extension",
    musclesPrimary: ["quadriceps"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Sit on the machine. Extend legs until fully straight. Pause for one second at the top. Lower slowly.",
    tips: ["Pull toes toward you at the top", "Slow lowering is important"],
    mistakes: ["Swinging the legs", "Dropping the weight at the bottom"],
    wikiUrl: "https://musclewiki.com/machine/male/quads/machine-leg-extension/",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-leg-extension-side.mp4",
  },
  {
    name: "Lying Leg Curl Machine",
    musclesPrimary: ["hamstrings"] as Muscle[],
    musclesSecondary: ["gastrocnemius"] as Muscle[],
    description:
      "Lie face down on the machine. Pad behind the ankles. Curl legs up to 90 degrees. Lower slowly.",
    tips: ["Press hips into the pad to prevent lower back arching"],
    mistakes: ["Hips lifting off the pad", "Lower back arching"],
    wikiUrl: "https://musclewiki.com/exercise/machine-hamstring-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-hamstring-curl-side.mp4",
  },
  {
    name: "Cable Pull-Through (Romanian Deadlift)",
    musclesPrimary: ["hamstrings", "glute_max"] as Muscle[],
    musclesSecondary: ["erector_spinae"] as Muscle[],
    description:
      "Stand facing away from the low cable. Hold the rope with both hands. Keep back straight. Hip hinge back until you feel hamstring stretch. Return up.",
    tips: ["Keep back completely straight throughout", "Movement initiates from the hip, not the lower back"],
    mistakes: ["Rounding the lower back", "Too much knee bend"],
    wikiUrl: "https://musclewiki.com/exercises/hamstrings",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-pull-through-side.mp4",
  },
  {
    name: "Seated Calf Raise Machine",
    musclesPrimary: ["soleus"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Sit on the machine. Pad rests on your knees. Raise heels until calves are fully extended. Lower slowly.",
    tips: ["Full range of motion is important", "Pause one second at the top"],
    mistakes: ["Partial range of motion"],
    wikiUrl: "https://musclewiki.com/exercises/calves",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-calf-raise-side.mp4",
  },
  {
    name: "Cable Tricep Pushdown",
    musclesPrimary: ["triceps_brachii"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Stand facing the machine. Keep elbows fixed at your sides. Push forearms down until fully extended.",
    tips: ["Elbows must not move — only the forearm moves"],
    mistakes: ["Elbows swinging forward", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-tricep-pushdown-side.mp4",
  },
  {
    name: "Machine Tricep Pushdown",
    musclesPrimary: ["triceps_brachii"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Sit on the tricep machine. Back flat against the pad. Grab the handles and push forearms down until fully extended. Return under control.",
    tips: ["Keep elbows fixed and at your sides", "Pause one second at full extension"],
    mistakes: ["Elbows flaring out", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-tricep-pushdown-side.mp4",
  },
  {
    name: "Dumbbell Skull Crusher",
    musclesPrimary: ["triceps_brachii"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Lie flat. Keep elbow fixed next to your head. Lower the dumbbell and return up. Each hand separately.",
    tips: ["The other hand can stabilize the active elbow"],
    mistakes: ["Elbows flaring out"],
    wikiUrl: "https://musclewiki.com/exercises/triceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-skull-crusher-side.mp4",
  },
  {
    name: "Cable Rope Pushdown",
    musclesPrimary: ["triceps_brachii"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Attach a rope handle to the high cable. Push forearms down and spread the rope apart at the bottom (V-shape).",
    tips: ["Spreading the rope at the bottom = more pressure on the lateral head"],
    mistakes: ["Elbows swinging forward", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-rope-pushdown-side.mp4",
  },
  {
    name: "Machine Overhead Press",
    musclesPrimary: ["front_delt", "side_delt"] as Muscle[],
    musclesSecondary: ["triceps_brachii"] as Muscle[],
    description:
      "Sit on the overhead press machine. Back fully against the pad. Handles at shoulder level. Press up until elbows nearly extend — don't lock out.",
    tips: ["Adjust seat so handles are at shoulder level", "Keep back against the pad throughout"],
    mistakes: ["Excessive lower back arch", "Locking out elbows"],
    wikiUrl: "https://musclewiki.com/exercise/machine-overhand-overhead-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-overhand-overhead-press-side.mp4",
  },
  {
    name: "Dumbbell Lateral Raise",
    musclesPrimary: ["side_delt"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description:
      "Stand upright. Light dumbbells at your sides. Elbows slightly bent. Raise dumbbells to the sides until parallel to the floor.",
    tips: ["Pinky finger slightly higher", "Light weight = correct form"],
    mistakes: ["Body swinging", "Raising dumbbells above shoulder level"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-lateral-raise-side.mp4",
  },
  {
    name: "Seated Alternating Hammer Front Raise",
    musclesPrimary: ["front_delt"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description: "Sit down. Hold dumbbells with a hammer grip. Raise one at a time to shoulder height.",
    tips: ["Seated position = less body swinging"],
    mistakes: ["Raising dumbbell above shoulder level", "Torso swinging"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-front-raise-side.mp4",
  },
  {
    name: "Dumbbell Shrug",
    musclesPrimary: ["traps_upper"] as Muscle[],
    musclesSecondary: [] as Muscle[],
    description: "Stand upright. Dumbbells at your sides. Shrug shoulders up. Hold for one second. Lower down.",
    tips: ["Don't bring neck forward", "Only up-down, not circular"],
    mistakes: ["Neck compression", "Elbows bending"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-shrug-side.mp4",
  },
  {
    name: "Machine Reverse Fly",
    musclesPrimary: ["rear_delt"] as Muscle[],
    musclesSecondary: ["traps_middle", "rhomboids"] as Muscle[],
    description: "Sit on the machine. Open arms backward until level with shoulders. Return slowly.",
    tips: ["Keep elbows slightly bent", "Press chest against the pad"],
    mistakes: ["Pulling arms too far back", "Shrugging the shoulders"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-reverse-fly-side.mp4",
  },
  {
    name: "Single-Arm Rotating Cable Row",
    musclesPrimary: ["lats"] as Muscle[],
    musclesSecondary: ["traps_middle", "biceps_brachii"] as Muscle[],
    description: "Sit on the cable row machine. Use a single handle. Pull toward your abdomen while slightly rotating the torso.",
    tips: ["Feel the pull in your back, not your arm"],
    mistakes: ["Pulling with the arm not the back", "Excessive lower back flexion"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-seated-row-side.mp4",
  },
  {
    name: "Wide-Grip Cable Row",
    musclesPrimary: ["lats"] as Muscle[],
    musclesSecondary: ["traps_middle"] as Muscle[],
    description: "Use a wide-grip handle. Pull toward your abdomen. At the end, squeeze shoulder blades together.",
    tips: ["Keep chest up throughout"],
    mistakes: ["Body swinging", "Pulling with arm not back"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-seated-row-side.mp4",
  },
  {
    name: "Wide-Grip Lat Pulldown",
    musclesPrimary: ["lats"] as Muscle[],
    musclesSecondary: ["traps_lower", "biceps_brachii"] as Muscle[],
    description: "Grip the bar wide. Pull down until it reaches below your chin. Pull using your elbows, not your wrists.",
    tips: ["Push chest forward and lean back slightly"],
    mistakes: ["Grip too wide", "Pulling bar behind the head"],
    wikiUrl: "https://musclewiki.com/exercise/machine-pulldown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-pulldown-side.mp4",
  },
  {
    name: "Single-Arm Cable Pulldown (Arc)",
    musclesPrimary: ["lats"] as Muscle[],
    musclesSecondary: ["serratus_anterior"] as Muscle[],
    description: "Grab a single handle from high cable. Pull toward your hip in an arc motion.",
    tips: ["Maintain an arc-shaped path"],
    mistakes: ["Pulling with arm and biceps instead of back"],
    wikiUrl: "https://musclewiki.com/exercise/machine-pulldown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-single-arm-pulldown-side.mp4",
  },
  {
    name: "Machine Chest-Supported Row (H-Row)",
    musclesPrimary: ["lats"] as Muscle[],
    musclesSecondary: ["traps_middle", "rhomboids"] as Muscle[],
    description: "Chest against support pad. Pull back with elbows moving along the torso. Squeeze shoulder blades together.",
    tips: ["Keep chest pressed against the support"],
    mistakes: ["Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-cable-row-side.mp4",
  },
];

/**
 * Copies the template library into one account.
 *
 * Exported so account creation (#60) can call it for each new user: every
 * account owns its own copy of these rows, because an upload deliberately
 * overwrites muscles and video links (#44) and that must not reach across
 * accounts.
 *
 * Idempotent per user - re-running refreshes the template rows it owns and
 * leaves anything the user added themselves alone.
 */
export async function seedExerciseLibrary(userId: number): Promise<number> {
  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { userId_name: { userId, name: ex.name } },
      update: {
        name: ex.name,
        musclesPrimary: ex.musclesPrimary,
        musclesSecondary: ex.musclesSecondary,
        description: ex.description,
        tips: ex.tips,
        mistakes: ex.mistakes,
        wikiUrl: ex.wikiUrl,
        videoUrl: ex.videoUrl,
      },
      create: { userId, ...ex },
    });
  }

  return exercises.length;
}

