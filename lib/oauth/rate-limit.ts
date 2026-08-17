import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * Postgres rather than an in-process counter because Vercel functions share no
 * memory: a module-level `Map` would be per-instance and reset on every cold
 * start, which is indistinguishable from having no rate limit at all.
 *
 * The window is fixed rather than sliding. A fixed window allows up to 2x the
 * limit across a window boundary, which is fine here - this exists to stop a
 * registration flood filling the table, not to meter a paid API.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** When the current window ends, for a `Retry-After` header. */
  resetAt: Date;
}

/**
 * Counts one hit against `bucket:identifier` and reports whether it is allowed.
 *
 * The upsert is atomic, so concurrent invocations on different instances cannot
 * both read a stale count and each decide they are under the limit.
 */
export async function consumeRateLimit(
  bucket: string,
  identifier: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowEndsAt = new Date(windowStart + windowMs);
  const key = `${bucket}:${identifier}:${windowStart}`;

  const row = await prisma.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, windowEndsAt },
    update: { count: { increment: 1 } },
  });

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    resetAt: windowEndsAt,
  };
}

/**
 * Best-effort client IP.
 *
 * On Vercel `x-forwarded-for` is set by the platform edge and its first entry
 * is the real client. Locally the header is absent, so everything shares one
 * bucket - acceptable, since the limit only needs to hold in production.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Deletes rate-limit rows whose window has closed. Called by the cleanup cron. */
export async function pruneRateLimits(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowEndsAt: { lt: now } },
  });
  return count;
}
