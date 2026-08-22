import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  localDay,
  localDayTime,
  localTime,
  normalizeTimeZone,
} from "./time";

describe("isValidTimeZone", () => {
  it("accepts real IANA names", () => {
    expect(isValidTimeZone("Asia/Tehran")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects anything the runtime cannot format in", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    // An offset is not a timezone: it cannot express a DST rule.
    expect(isValidTimeZone("+03:30")).toBe(false);
  });
});

describe("normalizeTimeZone", () => {
  it("passes a valid zone through", () => {
    expect(normalizeTimeZone("Asia/Tehran")).toBe("Asia/Tehran");
  });

  // A bad stored value must not throw on every later read. Degrading to UTC is
  // wrong-but-working; an exception in a formatter is neither.
  it("falls back to the default rather than throwing", () => {
    expect(normalizeTimeZone("nonsense")).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(normalizeTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("localDay", () => {
  // The motivating case: a 21:00 Tehran workout is 17:30Z. Bucketed in UTC it
  // would read as an afternoon session, and near midnight as the wrong day.
  it("buckets an evening Tehran workout on the local day", () => {
    const instant = new Date("2026-08-21T17:30:00Z");
    expect(localDay(instant, "Asia/Tehran")).toBe("2026-08-21");
    expect(localTime(instant, "Asia/Tehran")).toBe("21:00");
  });

  // 22:00 UTC is already tomorrow in Tehran. This is the case that silently
  // files a workout under the wrong day if the server bucketed in UTC.
  it("rolls to the next local day when UTC has not yet", () => {
    const instant = new Date("2026-08-21T22:00:00Z");
    expect(localDay(instant, "UTC")).toBe("2026-08-21");
    expect(localDay(instant, "Asia/Tehran")).toBe("2026-08-22");
  });

  // And the mirror: early UTC morning is still yesterday in Los Angeles.
  it("stays on the previous local day west of UTC", () => {
    const instant = new Date("2026-08-21T04:00:00Z");
    expect(localDay(instant, "America/Los_Angeles")).toBe("2026-08-20");
  });

  // The reason the column stores an IANA name and not an offset: Tehran is
  // +03:30 year-round now, but London is not, and a stored offset would be
  // wrong for half the year.
  it("follows the zone's own DST rule across the year", () => {
    const january = new Date("2026-01-15T23:30:00Z");
    const july = new Date("2026-07-15T23:30:00Z");
    expect(localDay(january, "Europe/London")).toBe("2026-01-15");
    expect(localDay(july, "Europe/London")).toBe("2026-07-16");
  });

  it("falls back to UTC for a broken stored zone instead of throwing", () => {
    const instant = new Date("2026-08-21T22:00:00Z");
    expect(() => localDay(instant, "nonsense")).not.toThrow();
    expect(localDay(instant, "nonsense")).toBe("2026-08-21");
  });
});

describe("localDayTime", () => {
  it("renders day and 24-hour time together", () => {
    expect(localDayTime(new Date("2026-08-21T17:34:00Z"), "Asia/Tehran")).toBe(
      "2026-08-21 21:04",
    );
  });

  // Midnight must be 00:xx, not 24:xx - some locales render the latter.
  it("renders midnight as 00", () => {
    expect(localTime(new Date("2026-08-21T00:10:00Z"), "UTC")).toBe("00:10");
  });
});
