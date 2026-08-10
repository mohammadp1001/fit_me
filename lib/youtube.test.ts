import { getYouTubeId, youTubeWatchUrl } from "./youtube";

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
