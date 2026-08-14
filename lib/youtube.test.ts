import {
  getYouTubeId,
  selectVideoPresentation,
  youTubeWatchUrl,
} from "./youtube";

const MP4 =
  "https://media.musclewiki.com/media/uploads/videos/branded/male-Machine-machine-chest-press-side.mp4";
const WIKI = "https://musclewiki.com/exercise/machine-chest-press";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_CANONICAL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("getYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the id from %s", (url, expected) => {
    expect(getYouTubeId(url)).toBe(expected);
  });

  it.each([
    ["", null],
    [null, null],
    [undefined, null],
    ["not a url", null],
    ["https://musclewiki.com/exercise/machine-chest-press", null],
    ["https://media.musclewiki.com/uploads/male-Machine-chest-press-side.mp4", null],
    ["https://www.youtube.com/watch?v=tooshort", null],
    ["https://www.youtube.com/feed/subscriptions", null],
    ["https://notyoutube.com/watch?v=dQw4w9WgXcQ", null],
  ])("returns null for %s", (url, expected) => {
    expect(getYouTubeId(url)).toBe(expected);
  });
});

describe("youTubeWatchUrl", () => {
  it("builds the canonical watch URL", () => {
    expect(youTubeWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});

describe("selectVideoPresentation", () => {
  it("plays a direct MuscleWiki media file inline", () => {
    expect(selectVideoPresentation(MP4, WIKI)).toEqual({
      kind: "inline",
      src: MP4,
    });
  });

  it("never plays a YouTube link inline, even with no other URL", () => {
    expect(selectVideoPresentation(YT, "")).toEqual({
      kind: "youtube",
      href: YT_CANONICAL,
    });
  });

  // The regression this rule exists for: a YouTube wikiUrl used to hijack the
  // panel and suppress the inline player for an exercise that had real media.
  it("keeps the inline player when the media is direct but the wiki link is YouTube", () => {
    expect(selectVideoPresentation(MP4, YT)).toEqual({
      kind: "inline",
      src: MP4,
    });
  });

  it("falls back to a YouTube wiki link when there is no media file", () => {
    expect(selectVideoPresentation("", YT)).toEqual({
      kind: "youtube",
      href: YT_CANONICAL,
    });
  });

  it("normalises a shorts link to the canonical watch URL", () => {
    expect(
      selectVideoPresentation("https://youtu.be/dQw4w9WgXcQ?t=42", ""),
    ).toEqual({ kind: "youtube", href: YT_CANONICAL });
  });

  it("links to the MuscleWiki page when there is no media and no YouTube", () => {
    expect(selectVideoPresentation("", WIKI)).toEqual({
      kind: "wiki",
      href: WIKI,
    });
  });

  it("reports nothing when both URLs are empty", () => {
    expect(selectVideoPresentation("", "")).toEqual({ kind: "none" });
  });

  it("tolerates null and undefined", () => {
    expect(selectVideoPresentation(null, undefined)).toEqual({ kind: "none" });
  });
});
