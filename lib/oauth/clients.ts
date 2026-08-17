import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashSecret, randomSecret } from "./crypto";
import { MAX_CLIENTS, SUPPORTED_SCOPES, UNUSED_CLIENT_TTL_MS } from "./config";

/**
 * Dynamic Client Registration (RFC 7591) store.
 *
 * Registration is intentionally unauthenticated - see the `OAuthClient` model
 * comment. Everything defensive here is about bounding table growth, not about
 * deciding who may register.
 */

/**
 * The subset of RFC 7591 client metadata this server honours.
 *
 * Unknown members are dropped rather than rejected: registration requests from
 * real clients carry plenty of fields (`client_uri`, `logo_uri`, `contacts`)
 * that make no difference to how this server behaves, and rejecting them would
 * break connection for no security gain.
 */
export const ClientRegistrationSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .default("none"),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

export type ClientRegistration = z.infer<typeof ClientRegistrationSchema>;

export class ClientCapReachedError extends Error {
  constructor() {
    super("Client registration limit reached");
  }
}

/**
 * Registers a client and returns the RFC 7591 response body.
 *
 * The plaintext secret is returned exactly once here and never stored, so a
 * confidential client that loses it must re-register.
 */
export async function registerClient(registration: ClientRegistration) {
  const total = await prisma.oAuthClient.count();
  if (total >= MAX_CLIENTS) {
    // Fail closed rather than evicting the oldest row: an attacker who can
    // force eviction could knock out a legitimate client mid-flow, turning a
    // storage-bounding measure into a denial-of-service primitive.
    throw new ClientCapReachedError();
  }

  const clientId = randomBytes(16).toString("hex");
  const isPublic = registration.token_endpoint_auth_method === "none";
  const secret = isPublic ? null : randomSecret();

  // Narrow the requested scope to what this server actually implements. An
  // unknown scope is dropped rather than rejected, per RFC 6749 §3.3.
  const requested = registration.scope?.split(/\s+/).filter(Boolean);
  const granted = requested?.length
    ? requested.filter((s): s is (typeof SUPPORTED_SCOPES)[number] =>
        (SUPPORTED_SCOPES as readonly string[]).includes(s),
      )
    : [...SUPPORTED_SCOPES];
  const scope = (granted.length ? granted : [...SUPPORTED_SCOPES]).join(" ");

  const client = await prisma.oAuthClient.create({
    data: {
      id: clientId,
      secretHash: secret ? hashSecret(secret) : null,
      name: registration.client_name ?? "Unnamed MCP client",
      redirectUris: registration.redirect_uris,
      tokenEndpointAuthMethod: registration.token_endpoint_auth_method,
      scope,
    },
  });

  return {
    client_id: client.id,
    ...(secret ? { client_secret: secret } : {}),
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: client.scope,
  };
}

export async function findClient(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { id: clientId } });
}

/**
 * Exact redirect-URI match.
 *
 * OAuth 2.1 requires exact string comparison. Prefix or wildcard matching is
 * the classic open-redirect hole: `https://claude.ai/callback` must not also
 * authorize `https://claude.ai/callback.attacker.example`.
 */
export function isRegisteredRedirectUri(
  client: { redirectUris: string[] },
  redirectUri: string,
): boolean {
  return client.redirectUris.includes(redirectUri);
}

/** Marks a client as in use, so the cleanup cron leaves it alone. */
export async function touchClient(clientId: string): Promise<void> {
  await prisma.oAuthClient.update({
    where: { id: clientId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Deletes clients that have gone unused past the TTL.
 *
 * `lastUsedAt` starts equal to `createdAt`, so a client registered and never
 * authorized is swept on the first run after the TTL - which is exactly the
 * residue a registration flood leaves behind.
 */
export async function pruneUnusedClients(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNUSED_CLIENT_TTL_MS);
  const { count } = await prisma.oAuthClient.deleteMany({
    where: { lastUsedAt: { lt: cutoff } },
  });
  return count;
}
