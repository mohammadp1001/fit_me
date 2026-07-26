import fs from "fs";
import path from "path";
import { renderMuscleReference } from "./muscles-doc";

const DOC = path.join(__dirname, "..", "examples", "MUSCLES.md");

/**
 * `examples/MUSCLES.md` is a golden file generated from the taxonomy, so the
 * published vocabulary can never drift from the `Muscle` enum.
 *
 * To regenerate after changing the taxonomy:
 *
 *   UPDATE_DOCS=1 npx jest lib/muscles-doc
 *
 * Regeneration rides on the test rather than a standalone script because jest
 * already resolves this project's TypeScript and ESM imports correctly, and a
 * script would need a build step or an extra dependency to do the same.
 */
describe("examples/MUSCLES.md", () => {
  it("is in sync with the taxonomy", () => {
    const expected = renderMuscleReference();

    if (process.env.UPDATE_DOCS) {
      fs.writeFileSync(DOC, expected);
    }

    // Normalise line endings: the repo checks out CRLF on Windows and LF in CI.
    const onDisk = fs.readFileSync(DOC, "utf8").replace(/\r\n/g, "\n");

    expect(onDisk).toBe(expected);
  });
});
