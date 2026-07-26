import { Muscle } from "@prisma/client";
import {
  MUSCLE_GROUP,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABEL,
  MUSCLE_LABEL,
  PRIMARY_SET_WEIGHT,
  SECONDARY_SET_WEIGHT,
  WEEKLY_SET_FLOOR,
  WEEKLY_SET_CEILING,
} from "./muscles";
import { VOLUME_WINDOW_DAYS } from "./volume";

/**
 * Renders `examples/MUSCLES.md` from the taxonomy itself.
 *
 * The reference is generated rather than hand-written so it cannot drift from
 * the `Muscle` enum - a hand-maintained copy of the vocabulary is exactly the
 * duplication this taxonomy replaced. `muscles-doc.test.ts` fails if the
 * checked-in file falls out of sync; see that file for how to regenerate.
 */
export function renderMuscleReference(): string {
  const lines: string[] = [];

  lines.push("# Canonical muscle values");
  lines.push("");
  lines.push(
    "<!-- Generated from lib/muscles.ts. Do not edit by hand: run `UPDATE_DOCS=1 npx jest lib/muscles-doc`. -->"
  );
  lines.push("");
  lines.push(
    "Every value a program YAML may use under `muscles.primary` / `muscles.secondary`."
  );
  lines.push(
    "Anything outside this list is rejected at upload. Display names are localised by"
  );
  lines.push(
    "the app, so YAML always uses the canonical value - never the Persian or English name."
  );
  lines.push("");
  lines.push("See [`TEMPLATE.yaml`](TEMPLATE.yaml) for the full program schema.");
  lines.push("");

  lines.push("## How these are counted");
  lines.push("");
  lines.push(
    `- Volume is measured in **hard sets** - a logged set counts only if it records reps above zero. Weight may be null, so bodyweight work still counts.`
  );
  lines.push(
    `- A set counts **${PRIMARY_SET_WEIGHT}** toward each \`primary\` muscle's group and **${SECONDARY_SET_WEIGHT}** toward each \`secondary\` one.`
  );
  lines.push(
    `- A set credits a **group** once, at the highest role weight it holds there. Tagging \`lats\` and \`rhomboids\` both as primary does not double that exercise's \`back\` volume.`
  );
  lines.push(
    `- The Progress tab totals the trailing **${VOLUME_WINDOW_DAYS} days**, and reads a group as low below **${WEEKLY_SET_FLOOR}** sets and high above **${WEEKLY_SET_CEILING}**.`
  );
  lines.push(
    "- Tag only the movers an exercise actually trains: over-tagging inflates your own numbers."
  );
  lines.push("");

  lines.push("## Values by group");
  lines.push("");

  for (const group of MUSCLE_GROUPS) {
    const members = (Object.keys(MUSCLE_GROUP) as Muscle[]).filter(
      (m) => MUSCLE_GROUP[m] === group
    );

    lines.push(
      `### \`${group}\` - ${MUSCLE_GROUP_LABEL[group].en} / ${MUSCLE_GROUP_LABEL[group].fa}`
    );
    lines.push("");
    lines.push("| Value | English | Persian |");
    lines.push("| --- | --- | --- |");
    for (const muscle of members) {
      lines.push(
        `| \`${muscle}\` | ${MUSCLE_LABEL[muscle].en} | ${MUSCLE_LABEL[muscle].fa} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
