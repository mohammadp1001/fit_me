import { NextRequest, NextResponse } from "next/server";
import { getSession, isAuthenticated } from "@/lib/session";
import { findClient, touchClient } from "@/lib/oauth/clients";
import { issueCode } from "@/lib/oauth/codes";
import {
  buildRedirect,
  parseAuthorizeParams,
  type ParseResult,
} from "@/lib/oauth/authorize-params";
import {
  renderConsentPage,
  renderErrorPage,
  renderPassphrasePage,
} from "@/lib/oauth/consent-page";

/**
 * The authorization endpoint - the only real gate in front of the MCP server.
 *
 * Registration is open and a `client_id` grants nothing; access is granted here
 * and nowhere else, by the passphrase plus an explicit Allow click.
 *
 * Both methods live in one route because the consent form posts back to itself,
 * carrying the original request as hidden fields.
 */

const HTML = { "Content-Type": "text/html; charset=utf-8" } as const;

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: HTML });
}

/** Turns a parse failure into either an on-page error or a redirect. */
function respondToParseFailure(result: Extract<ParseResult, { ok: false }>) {
  if ("fatal" in result) {
    // Nowhere trustworthy to redirect to, so the error is shown here. Bouncing
    // to an unvalidated redirect_uri would be an open redirect.
    return htmlResponse(renderErrorPage(result.fatal), 400);
  }

  return NextResponse.redirect(
    buildRedirect(result.redirectUri, {
      error: result.redirect.error,
      error_description: result.redirect.description,
      state: result.state,
    }),
    303,
  );
}

async function resolve(raw: URLSearchParams) {
  const clientId = raw.get("client_id")?.trim();
  const client = clientId ? await findClient(clientId) : null;
  return { client, parsed: parseAuthorizeParams(raw, client?.redirectUris ?? null) };
}

export async function GET(request: NextRequest) {
  const { client, parsed } = await resolve(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return respondToParseFailure(parsed);
  }

  const clientName = client?.name ?? "An application";

  if (!(await isAuthenticated())) {
    return htmlResponse(renderPassphrasePage(parsed.params, clientName));
  }

  return htmlResponse(renderConsentPage(parsed.params, clientName));
}

/**
 * Handles both form steps: passphrase submission and the Allow / Deny choice.
 *
 * CSRF is covered by the session cookie's `sameSite: "lax"` (see
 * `lib/session.ts`), which suppresses the cookie on cross-site POSTs. A forged
 * submission therefore arrives unauthenticated and falls through to the
 * passphrase form rather than granting anything.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const raw = new URLSearchParams();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      raw.set(key, value);
    }
  }

  const { client, parsed } = await resolve(raw);
  if (!parsed.ok) {
    return respondToParseFailure(parsed);
  }

  const clientName = client?.name ?? "An application";
  const action = raw.get("action");
  const passphrase = raw.get("passphrase");

  // Step 1: establish a session if there isn't one.
  if (!(await isAuthenticated())) {
    if (passphrase === null) {
      return htmlResponse(renderPassphrasePage(parsed.params, clientName));
    }

    if (passphrase !== process.env.APP_PASSPHRASE) {
      return htmlResponse(
        renderPassphrasePage(parsed.params, clientName, "Incorrect passphrase."),
        401,
      );
    }

    const session = await getSession();
    session.authenticated = true;
    await session.save();

    // Signing in is not consent. Show the Allow / Deny screen as a separate,
    // deliberate step rather than treating a correct passphrase as approval.
    return htmlResponse(renderConsentPage(parsed.params, clientName));
  }

  // Step 2: the authenticated user's decision.
  if (action !== "allow") {
    return NextResponse.redirect(
      buildRedirect(parsed.params.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the request.",
        state: parsed.params.state,
      }),
      303,
    );
  }

  const code = await issueCode({
    clientId: parsed.params.clientId,
    redirectUri: parsed.params.redirectUri,
    codeChallenge: parsed.params.codeChallenge,
    codeChallengeMethod: parsed.params.codeChallengeMethod,
    scope: parsed.params.scope,
    resource: parsed.params.resource,
  });

  await touchClient(parsed.params.clientId);

  return NextResponse.redirect(
    buildRedirect(parsed.params.redirectUri, {
      code,
      state: parsed.params.state,
    }),
    303,
  );
}
