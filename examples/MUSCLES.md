# Canonical muscle values

<!-- Generated from lib/muscles.ts. Do not edit by hand: run `UPDATE_DOCS=1 npx jest lib/muscles-doc`. -->

Every value a program YAML may use under `muscles.primary` / `muscles.secondary`.
Anything outside this list is rejected at upload. Display names are localised by
the app, so YAML always uses the canonical value - never the Persian or English name.

See [`TEMPLATE.yaml`](TEMPLATE.yaml) for the full program schema.

## How these are counted

- Volume is measured in **hard sets** - a logged set counts only if it records reps above zero. Weight may be null, so bodyweight work still counts.
- A set counts **1** toward each `primary` muscle's group and **0.5** toward each `secondary` one.
- A set credits a **group** once, at the highest role weight it holds there. Tagging `lats` and `rhomboids` both as primary does not double that exercise's `back` volume.
- The Progress tab totals the trailing **7 days**, and reads a group as low below **10** sets and high above **20**.
- Tag only the movers an exercise actually trains: over-tagging inflates your own numbers.

## Values by group

### `chest` - Chest / سینه

| Value | English | Persian |
| --- | --- | --- |
| `pec_major_clavicular` | Upper Chest | سینه بالایی |
| `pec_major_sternal` | Chest | سینه |

### `back` - Back / پشت

| Value | English | Persian |
| --- | --- | --- |
| `lats` | Lats | پشتی بزرگ |
| `traps_upper` | Upper Traps | ذوزنقه بالایی |
| `traps_middle` | Mid Traps | ذوزنقه میانی |
| `traps_lower` | Lower Traps | ذوزنقه پایینی |
| `rhomboids` | Rhomboids | لوزی |
| `teres_major` | Teres Major | گرد بزرگ |
| `erector_spinae` | Erector Spinae | راست‌کننده ستون فقرات |

### `shoulders` - Shoulders / سرشانه

| Value | English | Persian |
| --- | --- | --- |
| `front_delt` | Front Delt | دلتوئید جلو |
| `side_delt` | Side Delt | دلتوئید میانی |
| `rear_delt` | Rear Delt | دلتوئید خلفی |
| `serratus_anterior` | Serratus Anterior | دندانه‌ای جلو |

### `arms` - Arms / بازو

| Value | English | Persian |
| --- | --- | --- |
| `biceps_brachii` | Biceps | دو سر بازو |
| `brachialis` | Brachialis | براکیالیس |
| `triceps_brachii` | Triceps | سه سر بازو |

### `forearms` - Forearms / ساعد

| Value | English | Persian |
| --- | --- | --- |
| `brachioradialis` | Brachioradialis | براکیورادیالیس |
| `forearm_flexors` | Forearm Flexors | خم‌کننده ساعد |
| `forearm_extensors` | Forearm Extensors | بازکننده ساعد |

### `quads` - Quads / چهارسر

| Value | English | Persian |
| --- | --- | --- |
| `quadriceps` | Quadriceps | چهار سر ران |

### `hamstrings` - Hamstrings / همسترینگ

| Value | English | Persian |
| --- | --- | --- |
| `hamstrings` | Hamstrings | همسترینگ |

### `glutes` - Glutes / سرینی

| Value | English | Persian |
| --- | --- | --- |
| `glute_max` | Glute Max | سرینی بزرگ |
| `glute_med` | Glute Med | سرینی میانی |

### `adductors` - Adductors / نزدیک‌کننده

| Value | English | Persian |
| --- | --- | --- |
| `adductors` | Adductors | نزدیک‌کننده ران |

### `calves` - Calves / ساق پا

| Value | English | Persian |
| --- | --- | --- |
| `gastrocnemius` | Gastrocnemius | دوقلو ساق |
| `soleus` | Soleus | نعلی (سولئوس) |
| `tibialis_anterior` | Tibialis Anterior | درشت‌نی قدامی |

### `core` - Core / مرکزی

| Value | English | Persian |
| --- | --- | --- |
| `rectus_abdominis` | Abs | شکم راست |
| `obliques` | Obliques | مورب شکمی |
| `hip_flexors` | Hip Flexors | خم‌کننده لگن |
