import { AuthorizeParams } from "./authorize-params";

/**
 * The consent and passphrase screens, rendered as self-contained HTML.
 *
 * Plain HTML rather than a React page under `app/[locale]/` for two reasons:
 * the OAuth redirect carries a dozen query parameters that would have to
 * survive a locale rewrite, and `proxy.ts` deliberately lets `/api/*` through
 * untouched. Keeping the whole flow inside `/api/oauth/*` means no interaction
 * with i18n routing at all.
 *
 * Styles are inlined from the same custom properties as `globals.css` so the
 * screen looks like the rest of FitMe without depending on the Tailwind build.
 */

/** Escapes text for interpolation into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root {
    --bg: #0a0a0a; --surface: #141414; --surface2: #1e1e1e;
    --border: #2a2a2a; --text: #f0ede8; --muted: #666;
    --green: #4ade80; --red: #ef4444;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    background: var(--bg); color: var(--text);
    font-family: Tahoma, system-ui, sans-serif;
  }
  .card {
    width: 100%; max-width: 400px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 16px; padding: 24px;
  }
  h1 { font-size: 28px; font-weight: 900; margin: 0 0 4px; text-align: center; }
  .tagline { color: var(--muted); font-size: 13px; text-align: center; margin: 0 0 24px; }
  h2 { font-size: 17px; font-weight: 700; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.5; color: var(--muted); margin: 0 0 16px; }
  .client { color: var(--text); font-weight: 700; }
  ul { margin: 0 0 20px; padding-left: 20px; color: var(--muted); font-size: 13px; line-height: 1.9; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  input[type=password], input[type=text] {
    width: 100%; padding: 12px 16px; font-size: 14px; margin-bottom: 16px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 12px; color: var(--text); outline: none;
  }
  input[type=password]:focus, input[type=text]:focus { border-color: var(--muted); }
  .row { display: flex; gap: 12px; }
  button {
    flex: 1; padding: 12px; font-size: 14px; font-weight: 700;
    border-radius: 12px; border: 1px solid var(--border); cursor: pointer;
    font-family: inherit;
  }
  .primary { background: var(--green); color: #062012; border-color: var(--green); }
  .secondary { background: var(--surface2); color: var(--text); }
  .error {
    background: rgba(239,68,68,0.12); border: 1px solid var(--red);
    color: var(--red); font-size: 13px; padding: 10px 14px;
    border-radius: 10px; margin-bottom: 16px;
  }
  .uri {
    font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted);
    word-break: break-all; background: var(--surface2); padding: 8px 10px;
    border-radius: 8px; margin-bottom: 20px;
  }
`;

/** Re-emits the authorization request as hidden fields so the POST can rebuild it. */
function hiddenFields(params: AuthorizeParams): string {
  const entries: Array<[string, string | undefined]> = [
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["response_type", "code"],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", params.codeChallengeMethod],
    ["scope", params.scope],
    ["state", params.state],
    ["resource", params.resource],
  ];

  return entries
    .filter(([, v]) => v !== undefined && v !== "")
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${esc(k)}" value="${esc(v as string)}">`,
    )
    .join("\n      ");
}

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} - FitMe</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="card">
    <h1>FitMe</h1>
    <p class="tagline">Authorize access</p>
    ${inner}
  </div>
</body>
</html>`;
}

/**
 * The sign-in gate, shown when there is no valid session cookie.
 *
 * Username and password, the same credentials as the app itself (#60). It used
 * to be the single shared passphrase; with real accounts the consent screen has
 * to know *which* account is approving, because that is what the issued token
 * will be bound to.
 */
export function renderSignInPage(
  params: AuthorizeParams,
  clientName: string,
  error?: string,
): string {
  return page(
    "Sign in",
    `<h2>Sign in to continue</h2>
    <p><span class="client">${esc(clientName)}</span> wants to connect to your FitMe account.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ""}
    <form method="post" action="/api/oauth/authorize">
      ${hiddenFields(params)}
      <label for="username">Username</label>
      <input id="username" type="text" name="username" autofocus autocomplete="username" autocapitalize="none" spellcheck="false">
      <label for="password">Password</label>
      <input id="password" type="password" name="password" autocomplete="current-password">
      <div class="row">
        <button class="primary" type="submit" name="action" value="continue">Continue</button>
      </div>
    </form>`,
  );
}

/** The Allow / Deny screen, shown once the session is valid. */
export function renderConsentPage(
  params: AuthorizeParams,
  clientName: string,
): string {
  const scopes = params.scope.split(/\s+/).filter(Boolean);
  const canWrite = scopes.includes("fitme:write");

  return page(
    "Authorize",
    `<h2>Allow access?</h2>
    <p><span class="client">${esc(clientName)}</span> is asking to connect to your FitMe account.</p>
    <div class="uri">${esc(params.redirectUri)}</div>
    <ul>
      <li>Read your programs, workout logs and body weight</li>
      <li>Read your training volume and coach notes</li>
      ${canWrite ? "<li>Save suggested sets and coach notes</li>" : ""}
    </ul>
    <form method="post" action="/api/oauth/authorize">
      ${hiddenFields(params)}
      <div class="row">
        <button class="secondary" type="submit" name="action" value="deny">Deny</button>
        <button class="primary" type="submit" name="action" value="allow">Allow</button>
      </div>
    </form>`,
  );
}

/**
 * The dead end for a request that cannot be safely redirected.
 *
 * When `client_id` or `redirect_uri` fails to validate there is nowhere
 * trustworthy to send the user, so OAuth 2.1 requires showing the error here
 * instead. Redirecting to an unvalidated URI is precisely the open-redirect
 * this avoids.
 */
export function renderErrorPage(message: string): string {
  return page(
    "Error",
    `<h2>Cannot continue</h2>
    <div class="error">${esc(message)}</div>
    <p>Close this window and try connecting again.</p>`,
  );
}
