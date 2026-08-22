import { SESSION_GAP_MS, joinsSession } from "./sessions";

const at = (hoursAfter: number) =>
  new Date(new Date("2026-08-21T09:00:00Z").getTime() + hoursAfter * 3600_000);

describe("joinsSession", () => {
  it("keeps a workout whole across a normal rest between exercises", () => {
    expect(joinsSession(at(0), at(0.05))).toBe(true);
    expect(joinsSession(at(0), at(1.5))).toBe(true);
  });

  // The case the gap rule exists for: legs in the morning, arms at night.
  it("splits a morning and an evening workout", () => {
    expect(joinsSession(at(0), at(11))).toBe(false);
  });

  // Exclusive boundary, asserted from both sides so a later change to `<` or
  // `<=` cannot pass unnoticed.
  it("treats exactly the gap as a new session", () => {
    const start = at(0);
    const exactly = new Date(start.getTime() + SESSION_GAP_MS);
    const justUnder = new Date(start.getTime() + SESSION_GAP_MS - 1);
    expect(joinsSession(start, exactly)).toBe(false);
    expect(joinsSession(start, justUnder)).toBe(true);
  });

  // A phone clock running slightly behind the server must not open a second
  // session for a log that plainly belongs to the current one.
  it("tolerates a log arriving fractionally before the session's last activity", () => {
    const last = at(1);
    expect(joinsSession(last, new Date(last.getTime() - 30_000))).toBe(true);
  });
});
