import { NextRequest, NextResponse } from "next/server";
import {
  ClientCapReachedError,
  ClientRegistrationSchema,
  registerClient,
} from "@/lib/oauth/clients";
import { REGISTER_RATE_LIMIT } from "@/lib/oauth/config";
import { clientIp, consumeRateLimit } from "@/lib/oauth/rate-limit";

/**
 * RFC 7591 Dynamic Client Registration.
 *
 * Unauthenticated by design: a `client_id` grants nothing on its own, because
 * every token still has to pass the passphrase and the Allow click at
 * `/api/oauth/authorize`. What this endpoint *can* be abused for is filling the
 * table, so the defences here are a rate limit and a row cap rather than a
 * credential check.
 */
export async function POST(request: NextRequest) {
  const rate = await consumeRateLimit(
    "register",
    clientIp(request),
    REGISTER_RATE_LIMIT,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "temporarily_unavailable", error_description: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400 },
    );
  }

  const parsed = ClientRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: parsed.error.issues[0]?.message ?? "Invalid metadata",
      },
      { status: 400 },
    );
  }

  try {
    const registered = await registerClient(parsed.data);
    return NextResponse.json(registered, { status: 201 });
  } catch (err) {
    if (err instanceof ClientCapReachedError) {
      return NextResponse.json(
        {
          error: "temporarily_unavailable",
          error_description: "Client registration limit reached",
        },
        { status: 503 },
      );
    }
    throw err;
  }
}
