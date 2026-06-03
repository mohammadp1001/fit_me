import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const exercises = [
  {
    nameFa: "پرس سینه دستگاه",
    nameEn: "Machine Chest Press",
    muscles: ["سینه بزرگ", "سه سر بازو", "دلتوئید جلو"],
    descriptionFa:
      "روی صندلی دستگاه بنشین. پشتت کاملاً به پشتی بچسبه. دسته‌ها رو در سطح سینه میانی بگیر. هل بده جلو تا آرنج نزدیک به صاف بشه — ولی قفل نکن. کنترل‌شده برگرد.",
    descriptionEn:
      "Sit on the machine seat. Keep your back fully against the pad. Grip the handles at mid-chest level. Press forward until elbows are nearly straight — don't lock out. Return under control.",
    tipsFa: [
      "صندلی رو تنظیم کن تا دسته‌ها روبروی وسط سینه باشن",
      "پشت در طول حرکت به پشتی چسبیده بمونه",
      "پایین آوردن کنترل‌شده = فشار بیشتر",
    ],
    tipsEn: [
      "Adjust the seat so handles are at mid-chest level",
      "Keep your back against the pad throughout",
      "Controlled lowering = more tension",
    ],
    mistakesFa: ["صندلی خیلی بالا یا پایین", "قفل کردن آرنج", "کمر از پشتی جدا شدن"],
    mistakesEn: ["Seat too high or too low", "Locking out elbows", "Back coming off the pad"],
    wikiUrl: "https://musclewiki.com/exercise/machine-chest-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-chest-press-side.mp4",
  },
  {
    nameFa: "پرس بالا سینه دمبل",
    nameEn: "Dumbbell Incline Press",
    muscles: ["سینه بالایی", "دلتوئید جلو", "سه سر بازو"],
    descriptionFa:
      "نیمکت رو ۳۰-۴۵ درجه تنظیم کن. دمبل‌ها رو کنار سینه بالایی بگیر. هل بده بالا و در بالا دمبل‌ها رو کمی به هم نزدیک کن.",
    descriptionEn:
      "Set bench to 30-45 degrees. Hold dumbbells at upper chest level. Press up and bring dumbbells slightly together at the top.",
    tipsFa: [
      "زاویه نیمکت از ۴۵ درجه بیشتر نشه",
      "در بالاترین نقطه یه ثانیه مکث کن",
      "پشتت کاملاً به نیمکت چسبیده باشه",
    ],
    tipsEn: [
      "Don't exceed 45-degree angle",
      "Pause one second at the top",
      "Keep your back flat against the bench",
    ],
    mistakesFa: ["زاویه خیلی زیاد (تبدیل به حرکت شانه)", "دمبل‌ها رو ول کردن در پایین"],
    mistakesEn: ["Too steep an angle (becomes a shoulder press)", "Dropping the dumbbells at the bottom"],
    wikiUrl: "https://musclewiki.com/dumbbells/male/chest",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-incline-press-side.mp4",
  },
  {
    nameFa: "باترفلای دستگاه",
    nameEn: "Machine Pec Deck",
    muscles: ["سینه بزرگ", "سینه داخلی"],
    descriptionFa:
      "روی صندلی بشین. پشتت کاملاً به تکیه‌گاه بچسبه. دسته‌ها رو به هم نزدیک کن انگار می‌خوای چیزی رو بغل کنی. در بسته شدن یه ثانیه مکث کن.",
    descriptionEn:
      "Sit on the machine. Keep your back against the pad. Bring the handles together as if hugging something. Pause for one second at the closed position.",
    tipsFa: ["آرنج‌ها باید در یه سطح با شانه باشن", "بازشدن رو کنترل کن"],
    tipsEn: ["Elbows should be at shoulder level", "Control the opening phase"],
    mistakesFa: ["آرنج خیلی کشیده (فشار به مفصل)", "شانه‌ها رو بالا انداختن"],
    mistakesEn: ["Elbows too extended (joint stress)", "Shrugging the shoulders"],
    wikiUrl: "https://musclewiki.com/exercise/machine-chest-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-pec-deck-side.mp4",
  },
  {
    nameFa: "پرس زیر سینه سیم‌کش ایستاده",
    nameEn: "Cable Lower Chest Press",
    muscles: ["سینه پایینی", "سه سر بازو"],
    descriptionFa:
      "دستگیره‌ها رو از بالا بگیر. کمی به جلو خم بشو. دست‌ها رو از بالا به پایین هل بده. در پایین دست‌ها زیر سینه به هم می‌رسن.",
    descriptionEn:
      "Grab the handles from high pulleys. Lean slightly forward. Push hands downward and inward. Hands meet below the chest at the bottom.",
    tipsFa: ["تنه ثابت باشه", "حرکت فقط از مفصل شانه باشه"],
    tipsEn: ["Keep torso stable", "Movement only from the shoulder joint"],
    mistakesFa: ["خم شدن زیاد تنه", "کشیدن دسته با آرنج خم"],
    mistakesEn: ["Excessive trunk lean", "Pulling handles with bent elbows"],
    wikiUrl: "https://musclewiki.com/exercise/cable-pec-fly",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-pec-fly-side.mp4",
  },
  {
    nameFa: "دیپ پارالل",
    nameEn: "Parallel Bar Dips",
    muscles: ["سینه پایینی", "سه سر بازو", "دلتوئید جلو"],
    descriptionFa:
      "بین دو میله موازی تکیه بده. کمی به جلو خم بشو. پایین بیا تا آرنج ۹۰ درجه بشه. برگرد بالا بدون قفل کردن آرنج.",
    descriptionEn:
      "Support yourself between parallel bars. Lean slightly forward. Lower until elbows reach 90 degrees. Push back up without locking elbows.",
    tipsFa: ["خم شدن به جلو = سینه بیشتر، صاف = سه سر بیشتر", "پاها رو عقب جمع کن"],
    tipsEn: ["Leaning forward = more chest, upright = more triceps", "Cross your feet behind you"],
    mistakesFa: ["پایین رفتن خیلی زیاد", "پرتاب کردن بدن بالا"],
    mistakesEn: ["Going too deep", "Swinging the body upward"],
    wikiUrl: "https://musclewiki.com/exercises/triceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Bodyweight-dip-side.mp4",
  },
  {
    nameFa: "جلو بازو دمبل تناوبی روی میز بالا سینه",
    nameEn: "Incline Alternating Dumbbell Curl",
    muscles: ["دو سر بازو", "براکیالیس"],
    descriptionFa:
      "نیمکت رو ۶۰-۷۰ درجه تنظیم کن. یک دست رو بالا بیار در حالی که دیگری پایینه. مچ رو در بالا بپیچون (سوپینیشن).",
    descriptionEn:
      "Set bench to 60-70 degrees. Curl one arm while the other hangs. Supinate the wrist at the top.",
    tipsFa: ["آرنج‌ها تکون نخورن — فقط ساعد حرکت کنه", "در بالا یه ثانیه مکث و فشار بده"],
    tipsEn: ["Keep elbows fixed — only forearm moves", "Pause and squeeze at the top for one second"],
    mistakesFa: ["تاب دادن بدن", "آرنج رو به جلو انداختن"],
    mistakesEn: ["Body swinging", "Elbows swinging forward"],
    wikiUrl: "https://musclewiki.com/exercises/biceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-incline-bicep-curl-side.mp4",
  },
  {
    nameFa: "جلو بازو دستگاه (پریچر کرل)",
    nameEn: "Machine Preacher Curl",
    muscles: ["دو سر بازو", "براکیالیس", "براکیورادیالیس"],
    descriptionFa:
      "روی دستگاه بنشین. آرنج‌ها روی پد دستگاه ثابت. دستگیره رو بگیر و بالا بیار تا دو سر بازو کاملاً جمع بشه. آروم پایین بیار تا کشش رو حس کنی.",
    descriptionEn:
      "Sit on the machine. Keep elbows fixed on the pad. Curl the handle up until biceps are fully contracted. Lower slowly to feel the stretch.",
    tipsFa: [
      "آرنج‌ها کاملاً روی پد باشن",
      "پایین آوردن آروم = رشد بیشتر",
      "در بالا یه ثانیه مکث کن",
    ],
    tipsEn: [
      "Keep elbows fully on the pad",
      "Slow lowering = more growth",
      "Pause one second at the top",
    ],
    mistakesFa: ["آرنج از پد بلند شدن", "ول کردن ناگهانی وزنه", "تاب دادن شانه"],
    mistakesEn: ["Elbows lifting off the pad", "Dropping the weight suddenly", "Shoulder swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-plate-loaded-preacher-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-plate-loaded-preacher-curl-side.mp4",
  },
  {
    nameFa: "جلو بازو سیم‌کش ایستاده دست جمع",
    nameEn: "Close-Grip Cable Bicep Curl",
    muscles: ["دو سر بازو", "قله دو سر"],
    descriptionFa:
      "دستگیره کوچک رو به سیم‌کش پایین وصل کن. هر دو دست رو با فاصله کم بگیر. بالا بیار تا بازوها کاملاً جمع بشن.",
    descriptionEn:
      "Attach a short bar to the low cable. Grip with both hands close together. Curl up until arms are fully contracted.",
    tipsFa: ["کشش ثابت سیم‌کش = فشار بیشتر در کل دامنه"],
    tipsEn: ["Constant cable tension = more pressure throughout range of motion"],
    mistakesFa: ["عقب رفتن بدن برای کمک"],
    mistakesEn: ["Leaning body back for assistance"],
    wikiUrl: "https://musclewiki.com/exercise/cable-bar-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-bar-curl-side.mp4",
  },
  {
    nameFa: "جلو بازو سیم‌کش مچ برعکس",
    nameEn: "Cable Reverse Bicep Curl",
    muscles: ["براکیورادیالیس", "ساعد"],
    descriptionFa:
      "مثل جلو بازو سیم‌کش ولی کف دست رو به پایین بگیر (پرونیشن). بیشتر روی ساعد کار می‌کنه.",
    descriptionEn:
      "Like a cable curl but grip with palms facing down (pronated). Works more forearm.",
    tipsFa: ["وزنه رو سبک‌تر از جلو بازو معمولی بگیر"],
    tipsEn: ["Use lighter weight than regular curls"],
    mistakesFa: ["مچ رو خم کردن در حرکت"],
    mistakesEn: ["Bending the wrist during the movement"],
    wikiUrl: "https://musclewiki.com/exercises/biceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-reverse-bicep-curl-side.mp4",
  },
  {
    nameFa: "پرس پا دستگاه خوابیده پا باز",
    nameEn: "Wide-Stance Leg Press",
    muscles: ["چهار سر ران", "سرینی", "همسترینگ"],
    descriptionFa:
      "روی دستگاه بخواب. پاها رو با فاصله بیشتر از عرض شانه بالا قرار بده. پنجه‌ها کمی به بیرون. زانوها رو خم کن تا ۹۰ درجه. هل بده ولی زانو قفل نکن.",
    descriptionEn:
      "Lie on the machine. Place feet wider than shoulder-width apart. Toes slightly out. Bend knees to 90 degrees. Press without locking knees.",
    tipsFa: ["پاهای باز = سرینی و داخل ران بیشتر", "پشت کمر به صندلی چسبیده بمونه"],
    tipsEn: ["Wide stance = more glutes and inner thigh", "Keep lower back pressed to the seat"],
    mistakesFa: ["زانو قفل کردن در بالا", "باسن از صندلی بلند شدن"],
    mistakesEn: ["Locking knees at the top", "Hips coming off the seat"],
    wikiUrl: "https://musclewiki.com/exercise/machine-leg-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-leg-press-side.mp4",
  },
  {
    nameFa: "فول هاگ پا دستگاه پا باز",
    nameEn: "Wide-Stance Hack Squat",
    muscles: ["چهار سر ران", "سرینی بزرگ", "همسترینگ"],
    descriptionFa:
      "زیر دستگاه هاگ قرار بگیر. پاها عریض‌تر از شانه. پایین بشین تا ران‌ها موازی زمین بشن یا پایین‌تر.",
    descriptionEn:
      "Position yourself under the hack squat machine. Feet wider than shoulders. Lower until thighs are parallel to the floor or below.",
    tipsFa: ["نگاهت رو به بالا-جلو ثابت نگه دار", "زانوها همراستای پنجه باشن"],
    tipsEn: ["Keep gaze forward and slightly up", "Knees should track over toes"],
    mistakesFa: ["زانو به داخل جمع شدن", "پاشنه از زمین بلند شدن"],
    mistakesEn: ["Knees caving inward", "Heels lifting off the platform"],
    wikiUrl: "https://musclewiki.com/exercise/machine-leg-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-hack-squat-side.mp4",
  },
  {
    nameFa: "جلو پا دستگاه نشسته",
    nameEn: "Machine Leg Extension",
    muscles: ["چهار سر ران"],
    descriptionFa:
      "روی دستگاه بشین. پاها رو بالا بیار تا کاملاً صاف بشن. در بالا یه ثانیه مکث کن. آروم پایین بیار.",
    descriptionEn:
      "Sit on the machine. Extend legs until fully straight. Pause for one second at the top. Lower slowly.",
    tipsFa: ["در بالا پنجه رو به سمت خودت بکش", "پایین آوردن آروم مهمه"],
    tipsEn: ["Pull toes toward you at the top", "Slow lowering is important"],
    mistakesFa: ["تاب دادن پاها", "ول کردن وزنه در پایین"],
    mistakesEn: ["Swinging the legs", "Dropping the weight at the bottom"],
    wikiUrl: "https://musclewiki.com/machine/male/quads/machine-leg-extension/",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-leg-extension-side.mp4",
  },
  {
    nameFa: "پشت پا دستگاه خوابیده",
    nameEn: "Lying Leg Curl Machine",
    muscles: ["همسترینگ", "ساق پا"],
    descriptionFa:
      "روی دستگاه دمر بخواب. بالشتک پشت مچ پا. پاها رو بالا بیار تا ۹۰ درجه. آروم پایین بیار.",
    descriptionEn:
      "Lie face down on the machine. Pad behind the ankles. Curl legs up to 90 degrees. Lower slowly.",
    tipsFa: ["باسن رو به صندلی فشار بده تا کمر قوس نخوره"],
    tipsEn: ["Press hips into the pad to prevent lower back arching"],
    mistakesFa: ["باسن از صندلی بلند شدن", "کمر قوس خوردن"],
    mistakesEn: ["Hips lifting off the pad", "Lower back arching"],
    wikiUrl: "https://musclewiki.com/exercise/machine-hamstring-curl",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-hamstring-curl-side.mp4",
  },
  {
    nameFa: "ددلیفت رومانیایی سیم‌کش پایین",
    nameEn: "Cable Pull-Through (Romanian Deadlift)",
    muscles: ["همسترینگ", "سرینی بزرگ", "کمر پایین"],
    descriptionFa:
      "رو به دستگاه سیم‌کش پایین بایست. طناب رو با دو دست بگیر. کمر رو صاف نگه دار. با لگن به عقب برو تا کشش همسترینگ رو حس کنی. برگرد بالا.",
    descriptionEn:
      "Stand facing away from the low cable. Hold the rope with both hands. Keep back straight. Hip hinge back until you feel hamstring stretch. Return up.",
    tipsFa: ["کمر در طول حرکت کاملاً صاف باشه", "حرکت از لگن شروع می‌شه نه کمر"],
    tipsEn: ["Keep back completely straight throughout", "Movement initiates from the hip, not the lower back"],
    mistakesFa: ["گرد شدن کمر", "زانو خم شدن زیاد"],
    mistakesEn: ["Rounding the lower back", "Too much knee bend"],
    wikiUrl: "https://musclewiki.com/exercises/hamstrings",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-pull-through-side.mp4",
  },
  {
    nameFa: "ساق پا دستگاه نشسته",
    nameEn: "Seated Calf Raise Machine",
    muscles: ["ساق پا داخلی (سولئوس)"],
    descriptionFa:
      "روی دستگاه بشین. بالشتک روی زانوها. پنجه رو بالا بیار تا ساق کاملاً کشیده بشه. آروم پایین بیار.",
    descriptionEn:
      "Sit on the machine. Pad rests on your knees. Raise heels until calves are fully extended. Lower slowly.",
    tipsFa: ["دامنه کامل حرکت مهمه", "در بالا یه ثانیه مکث کن"],
    tipsEn: ["Full range of motion is important", "Pause one second at the top"],
    mistakesFa: ["نیمه حرکت کردن"],
    mistakesEn: ["Partial range of motion"],
    wikiUrl: "https://musclewiki.com/exercises/calves",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-calf-raise-side.mp4",
  },
  {
    nameFa: "پشت بازو سیم‌کش ایستاده",
    nameEn: "Cable Tricep Pushdown",
    muscles: ["سه سر بازو"],
    descriptionFa:
      "رو به دستگاه بایست. آرنج‌ها کنار تنه ثابت. ساعد رو پایین بیار تا کاملاً صاف بشه.",
    descriptionEn:
      "Stand facing the machine. Keep elbows fixed at your sides. Push forearms down until fully extended.",
    tipsFa: ["آرنج‌ها تکون نخورن — فقط ساعد حرکت کنه"],
    tipsEn: ["Elbows must not move — only the forearm moves"],
    mistakesFa: ["آرنج به جلو آوردن", "تاب دادن بدن"],
    mistakesEn: ["Elbows swinging forward", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-tricep-pushdown-side.mp4",
  },
  {
    nameFa: "پشت بازو دستگاه",
    nameEn: "Machine Tricep Pushdown",
    muscles: ["سه سر بازو (سر بلند)"],
    descriptionFa:
      "روی دستگاه پشت بازو بنشین. پشت به پشتی چسبیده باشه. دسته‌ها رو بگیر و ساعد رو پایین هل بده تا کاملاً صاف بشه. کنترل‌شده برگرد.",
    descriptionEn:
      "Sit on the tricep machine. Back flat against the pad. Grab the handles and push forearms down until fully extended. Return under control.",
    tipsFa: ["آرنج‌ها ثابت و کنار تنه باشن", "در پایین یه ثانیه مکث کن"],
    tipsEn: ["Keep elbows fixed and at your sides", "Pause one second at full extension"],
    mistakesFa: ["آرنج به طرفین باز شدن", "تاب دادن بدن"],
    mistakesEn: ["Elbows flaring out", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-tricep-pushdown-side.mp4",
  },
  {
    nameFa: "پشت بازو دمبل خوابیده تک بغل گوش",
    nameEn: "Dumbbell Skull Crusher",
    muscles: ["سه سر بازو (سر بلند)"],
    descriptionFa:
      "دراز بکش. آرنج رو کنار گوش ثابت نگه دار. دمبل رو پایین بیار و برگرد بالا. هر دست جداگانه.",
    descriptionEn:
      "Lie flat. Keep elbow fixed next to your head. Lower the dumbbell and return up. Each hand separately.",
    tipsFa: ["دست دیگه می‌تونه آرنج فعال رو نگه داره"],
    tipsEn: ["The other hand can stabilize the active elbow"],
    mistakesFa: ["آرنج به طرفین باز شدن"],
    mistakesEn: ["Elbows flaring out"],
    wikiUrl: "https://musclewiki.com/exercises/triceps",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-skull-crusher-side.mp4",
  },
  {
    nameFa: "پشت بازو سیم‌کش طنابی ایستاده",
    nameEn: "Cable Rope Pushdown",
    muscles: ["سه سر بازو", "سر خارجی"],
    descriptionFa:
      "دستگیره طنابی به سیم‌کش بالا وصل کن. ساعدها رو پایین بیار و در پایین طناب رو از هم باز کن (V شکل).",
    descriptionEn:
      "Attach a rope handle to the high cable. Push forearms down and spread the rope apart at the bottom (V-shape).",
    tipsFa: ["باز کردن طناب در پایین = فشار بیشتر روی سر خارجی"],
    tipsEn: ["Spreading the rope at the bottom = more pressure on the lateral head"],
    mistakesFa: ["آرنج به جلو آمدن", "تاب دادن بدن"],
    mistakesEn: ["Elbows swinging forward", "Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-tricep-pushdown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-rope-pushdown-side.mp4",
  },
  {
    nameFa: "پرس سرشانه دستگاه نشسته",
    nameEn: "Machine Overhead Press",
    muscles: ["دلتوئید جلو", "دلتوئید میانی", "سه سر بازو"],
    descriptionFa:
      "روی دستگاه پرس سرشانه بنشین. پشتت کاملاً به پشتی چسبیده باشه. دسته‌ها در سطح شانه. هل بده بالا تا آرنج نزدیک به صاف بشه — ولی قفل نکن.",
    descriptionEn:
      "Sit on the overhead press machine. Back fully against the pad. Handles at shoulder level. Press up until elbows nearly extend — don't lock out.",
    tipsFa: ["صندلی رو تنظیم کن تا دسته‌ها در سطح شانه باشن", "پشت در طول حرکت به پشتی چسبیده بمونه"],
    tipsEn: ["Adjust seat so handles are at shoulder level", "Keep back against the pad throughout"],
    mistakesFa: ["قوس کمر زیاد", "قفل کردن آرنج"],
    mistakesEn: ["Excessive lower back arch", "Locking out elbows"],
    wikiUrl: "https://musclewiki.com/exercise/machine-overhand-overhead-press",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-overhand-overhead-press-side.mp4",
  },
  {
    nameFa: "سرشانه نشر جانب دمبل ایستاده",
    nameEn: "Dumbbell Lateral Raise",
    muscles: ["دلتوئید میانی"],
    descriptionFa:
      "بایست. دمبل‌های سبک کنار بدن. آرنج کمی خم. دمبل‌ها رو به طرفین بالا بیار تا موازی زمین بشن.",
    descriptionEn:
      "Stand upright. Light dumbbells at your sides. Elbows slightly bent. Raise dumbbells to the sides until parallel to the floor.",
    tipsFa: ["انگشت کوچک کمی بالاتر باشه", "وزنه سبک = فرم درست"],
    tipsEn: ["Pinky finger slightly higher", "Light weight = correct form"],
    mistakesFa: ["تاب دادن بدن", "دمبل‌ها رو بالاتر از شانه بردن"],
    mistakesEn: ["Body swinging", "Raising dumbbells above shoulder level"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-lateral-raise-side.mp4",
  },
  {
    nameFa: "سرشانه نشر از جلو دمبل چکشی متناوب نشسته",
    nameEn: "Seated Alternating Hammer Front Raise",
    muscles: ["دلتوئید جلو"],
    descriptionFa: "بنشین. دمبل‌ها رو با گریپ چکشی بگیر. یکی یکی به جلو بالا بیار تا موازی زمین.",
    descriptionEn: "Sit down. Hold dumbbells with a hammer grip. Raise one at a time to shoulder height.",
    tipsFa: ["نشستن = کمتر تاب خوردن بدن"],
    tipsEn: ["Seated position = less body swinging"],
    mistakesFa: ["از شانه بردن دمبل بالاتر", "تاب دادن تنه"],
    mistakesEn: ["Raising dumbbell above shoulder level", "Torso swinging"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-front-raise-side.mp4",
  },
  {
    nameFa: "شراگز دمبل از بغل",
    nameEn: "Dumbbell Shrug",
    muscles: ["ذوزنقه بالایی"],
    descriptionFa: "بایست. دمبل‌ها کنار بدن. شانه‌ها رو بالا بیار. یه ثانیه نگه دار. پایین بیار.",
    descriptionEn: "Stand upright. Dumbbells at your sides. Shrug shoulders up. Hold for one second. Lower down.",
    tipsFa: ["گردن رو به جلو نیار", "فقط بالا-پایین، نه دایره‌ای"],
    tipsEn: ["Don't bring neck forward", "Only up-down, not circular"],
    mistakesFa: ["گردن فشرده شدن", "آرنج خم شدن"],
    mistakesEn: ["Neck compression", "Elbows bending"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Dumbbells-dumbbell-shrug-side.mp4",
  },
  {
    nameFa: "فلای معکوس دستگاه",
    nameEn: "Machine Reverse Fly",
    muscles: ["دلتوئید خلفی", "ذوزنقه میانی", "لوزی"],
    descriptionFa: "روی دستگاه بنشین. دست‌ها رو به عقب باز کن تا در یه سطح با شانه باشن. آروم برگرد.",
    descriptionEn: "Sit on the machine. Open arms backward until level with shoulders. Return slowly.",
    tipsFa: ["آرنج کمی خم باشه", "سینه رو به پشتی فشار بده"],
    tipsEn: ["Keep elbows slightly bent", "Press chest against the pad"],
    mistakesFa: ["خیلی عقب بردن دست‌ها", "شانه بالا انداختن"],
    mistakesEn: ["Pulling arms too far back", "Shrugging the shoulders"],
    wikiUrl: "https://musclewiki.com/exercises/front-shoulders",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-reverse-fly-side.mp4",
  },
  {
    nameFa: "زیر بغل قایقی تک دست چرخشی",
    nameEn: "Single-Arm Rotating Cable Row",
    muscles: ["پشتی بزرگ", "ذوزنقه", "بایسپس"],
    descriptionFa: "روی دستگاه قایقی بنشین. یه دستگیره تک بگیر. بکش به طرف شکم در حالی که تنه رو کمی می‌چرخونی.",
    descriptionEn: "Sit on the cable row machine. Use a single handle. Pull toward your abdomen while slightly rotating the torso.",
    tipsFa: ["کشش رو با پشت حس کن نه دست"],
    tipsEn: ["Feel the pull in your back, not your arm"],
    mistakesFa: ["با دست کشیدن نه پشت", "خم شدن زیاد کمر"],
    mistakesEn: ["Pulling with the arm not the back", "Excessive lower back flexion"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-seated-row-side.mp4",
  },
  {
    nameFa: "زیر بغل قایقی دست باز",
    nameEn: "Wide-Grip Cable Row",
    muscles: ["پشتی بزرگ", "ذوزنقه میانی"],
    descriptionFa: "دستگیره عریض بگیر. بکش به سمت شکم. در انتها تیغه کتف‌ها رو به هم فشار بده.",
    descriptionEn: "Use a wide-grip handle. Pull toward your abdomen. At the end, squeeze shoulder blades together.",
    tipsFa: ["سینه رو بالا نگه دار"],
    tipsEn: ["Keep chest up throughout"],
    mistakesFa: ["تاب دادن بدن", "کشیدن با دست نه پشت"],
    mistakesEn: ["Body swinging", "Pulling with arm not back"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-seated-row-side.mp4",
  },
  {
    nameFa: "لت از جلو دست باز",
    nameEn: "Wide-Grip Lat Pulldown",
    muscles: ["پشتی بزرگ", "ذوزنقه پایین"],
    descriptionFa: "میله رو با دست‌های باز بگیر. بکش پایین تا به زیر چانه برسه. با آرنج‌هات پایین بکش، نه مچ.",
    descriptionEn: "Grip the bar wide. Pull down until it reaches below your chin. Pull using your elbows, not your wrists.",
    tipsFa: ["سینه رو به جلو بده و کمی به عقب تکیه کن"],
    tipsEn: ["Push chest forward and lean back slightly"],
    mistakesFa: ["دست‌های خیلی عریض", "میله رو پشت سر بردن"],
    mistakesEn: ["Grip too wide", "Pulling bar behind the head"],
    wikiUrl: "https://musclewiki.com/exercise/machine-pulldown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-pulldown-side.mp4",
  },
  {
    nameFa: "زیر بغل سیم‌کش هلالی تک دست",
    nameEn: "Single-Arm Cable Pulldown (Arc)",
    muscles: ["پشتی بزرگ", "دندانه‌ای جلو"],
    descriptionFa: "دستگیره تک رو از بالا بگیر. بکش به سمت لگن در یه قوس هلالی.",
    descriptionEn: "Grab a single handle from high cable. Pull toward your hip in an arc motion.",
    tipsFa: ["مسیر هلالی شکل داشته باشه"],
    tipsEn: ["Maintain an arc-shaped path"],
    mistakesFa: ["کشیدن با دست و بایسپس"],
    mistakesEn: ["Pulling with arm and biceps instead of back"],
    wikiUrl: "https://musclewiki.com/exercise/machine-pulldown",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Cables-cable-single-arm-pulldown-side.mp4",
  },
  {
    nameFa: "زیر بغل دستگاه H",
    nameEn: "Machine Chest-Supported Row (H-Row)",
    muscles: ["پشتی بزرگ", "ذوزنقه میانی", "لوزی"],
    descriptionFa: "سینه به تکیه‌گاه. بکش به عقب در حالی که آرنج‌ها کنار تنه حرکت می‌کنن. تیغه کتف‌ها رو به هم بکش.",
    descriptionEn: "Chest against support pad. Pull back with elbows moving along the torso. Squeeze shoulder blades together.",
    tipsFa: ["سینه به تکیه‌گاه چسبیده بمونه"],
    tipsEn: ["Keep chest pressed against the support"],
    mistakesFa: ["تاب دادن بدن"],
    mistakesEn: ["Body swinging"],
    wikiUrl: "https://musclewiki.com/exercise/machine-seated-cable-row",
    videoUrl: "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-seated-cable-row-side.mp4",
  },
];

async function main() {
  console.log("Seeding exercise library...");

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { nameFa: ex.nameFa },
      update: {
        nameEn: ex.nameEn,
        muscles: ex.muscles,
        descriptionFa: ex.descriptionFa,
        descriptionEn: ex.descriptionEn,
        tipsFa: ex.tipsFa,
        tipsEn: ex.tipsEn,
        mistakesFa: ex.mistakesFa,
        mistakesEn: ex.mistakesEn,
        wikiUrl: ex.wikiUrl,
        videoUrl: ex.videoUrl,
      },
      create: ex,
    });
  }

  console.log(`Seeded ${exercises.length} exercises.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
