const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the 11-character video id from a YouTube URL, or null if the URL is
 * not a YouTube video link. Handles watch, youtu.be, shorts, embed and live.
 */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return ID.test(segments[0] ?? "") ? segments[0] : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  if (segments[0] === "watch") {
    const v = parsed.searchParams.get("v") ?? "";
    return ID.test(v) ? v : null;
  }

  if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
    return ID.test(segments[1] ?? "") ? segments[1] : null;
  }

  return null;
}

/**
 * Canonical watch URL for a video id. Mobile OSes hand this to the YouTube app
 * when it is installed, and fall back to the browser when it is not.
 */
export function youTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
