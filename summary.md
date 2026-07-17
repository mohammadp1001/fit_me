# FitMe — Agent Handoff

A single-user, bilingual (Persian/English) workout tracker. Define a training
program in a YAML file, upload it, log every set at the gym, track progress.
Installable PWA. **Live:** https://fit-me-eta.vercel.app

> **Read `AGENTS.md` first.** This project runs a modified Next.js; consult the
> guides in `node_modules/next/dist/docs/` before writing Next.js code.

---

## Tech stack

- **Next.js 16** (App Router, `[locale]` routing, server components, route handlers)
- **React 18**, **Tailwind v4**
- **Prisma v6** ORM → **PostgreSQL on Neon**
- **next-intl v4** (fa/en, RTL/LTR) · **iron-session v8** (single-passphrase auth)
- **next-pwa** (generates `public/sw.js`, `public/workbox-*.js` — gitignored/lint-ignored)
- **Jest 30** + Testing Library · **ESLint 9** flat config
- Hosted on **Vercel**, deployed via **GitHub Actions** (see CI/CD below)

## Layout

- `app/[locale]/` — pages (page, login, onboarding) + `layout.tsx`
- `app/api/` — route handlers: `setup` (YAML upload), `programs/[id]` (delete),
  `programs/activate`, `logs`, `user`, `body-weight`, `exercises/[id]`, `auth/*`
- `components/` — `AppShell`, `ProgramView`, `LogView`, `ProgressView`,
  `ProfileView`, `ExerciseDetail`, `OnboardingForm`
- `lib/` — `yaml-parser.ts` (+ `.test.ts`), `prisma.ts`, `session.ts`
- `prisma/schema.prisma`, `prisma/seed.ts`
- `examples/` — program YAMLs; **`examples/TEMPLATE.yaml` is the annotated schema reference**

## Data model (prisma/schema.prisma)

`User` (id=1, single user) → `Program[]` → `ProgramDay[]` → `ProgramExercise[]`
→ references shared `Exercise` library. Also `BodyWeight[]`, `WorkoutLog[]`.
`Exercise` carries bilingual `nameFa/En`, `muscles[]`, `descriptionFa/En`,
`tipsFa/En[]`, `mistakesFa/En[]`, `videoUrl`, `wikiUrl`.

---

## Program YAML schema

**Source of truth: `examples/TEMPLATE.yaml`** (annotated + parser-verified).
Parsed/validated by `lib/yaml-parser.ts` (zod). Per exercise:

- `name` (required, primary/Persian key), `muscles[]`, `sets` (int), `reps`
  (int or per-set list), `superset_with` (partner's exact name, on both)
- `video` (direct URL, plays inline), `description`/`tips[]`/`mistakes[]` (Guide tab)
- Bilingual convention: base field = primary; optional `*_en` variant falls back
  to base when omitted (mirrors `name`/`name_en`). Applies to name, description,
  tips, mistakes.
- **Fields not in the schema are silently dropped** — don't invent new ones.

Exercises are keyed by `name` in a shared library. On upload (`app/api/setup`),
a new name is created with its guide/video; an existing one is **backfilled**
only where a field is still empty (never clobbers). So re-uploading a program
fills in content added to the YAML later.

---

## CI/CD

### CI — `.github/workflows/ci.yml`
Runs on every PR to `main` and on push to `main`: install → **lint → typecheck
(`tsc --noEmit`) → test (`jest`) → build**. Required status check named
**"Lint, typecheck, test & build"** (enforced by the `main` ruleset).

> Uses `npm install`, NOT `npm ci`: the committed `package-lock.json` is
> Windows-generated and can't satisfy `npm ci`'s cross-platform check on the
> Ubuntu runner (Tailwind oxide / `@emnapi` optional native deps). Do not
> "fix" this back to `npm ci` without regenerating the lock on Linux.

### Deploy — `.github/workflows/deploy.yml`
Triggered by pushing a tag `releases/**`. Runs `vercel deploy --prod` (builds
**on Vercel's infra**, not the runner) then publishes a GitHub Release.

> Do NOT switch to `vercel build --prebuilt`: the build runs `prisma db push`,
> which needs sensitive prod env vars that `vercel pull` can't return to the
> runner → `P1013: database string is invalid`. Remote build resolves them.

### Release — `.github/workflows/release.yml`
Manual `workflow_dispatch` with a `bump` input (patch/minor/major). Bumps the
version, pushes `release/vX.Y.Z`, opens a PR to `main`.

### How to cut a release
1. **Actions → Release → Run workflow** → choose the bump. It opens a version PR.
2. Merge that PR into `main`.
3. Cut the tag: `git tag releases/vX.Y.Z && git push origin releases/vX.Y.Z`
   → fires `deploy.yml` → prod deploy + GitHub Release.

Current released version: **v0.1.1**.

---

## Vercel setup

- Vercel's native Git auto-deploy is **disabled** (`vercel.json`:
  `git.deploymentEnabled: false`, `github.deploymentEnabled: false`). Actions
  owns production; there are **no PR preview deploys** (intentional, solo maintainer).
- Repo secrets already set: `VERCEL_TOKEN`, `VERCEL_ORG_ID`
  (`team_kBaiMsv24hGl1gGWeB6pvz3v`), `VERCEL_PROJECT_ID`
  (`prj_b0QzRhrBZS12rbfkwpPAhfENihyM`).
- Prod env vars (DATABASE_URL, DIRECT_URL, SESSION_SECRET, APP_PASSPHRASE) live
  in the Vercel dashboard (Production scope), resolved during the remote build.

### Branch/tag protection (rulesets)
- `main` (branch, id 17335791): requires PR + linear history + the CI check;
  1 bypass actor (the owner). Merges in practice use `gh pr merge --squash --admin`.
- `release` (tag, id 19073713): tags `refs/tags/releases/**` are restricted —
  only bypass actors (owner) can create them. That's why release tags are cut
  by a human, not the CI bot.
- Repo setting "Allow GitHub Actions to create and approve pull requests" is
  **enabled** (needed for `release.yml` to open its PR).

---

## Database gotchas

- Neon: **pooled** `DATABASE_URL` (PgBouncer, always-on) + **direct** `DIRECT_URL`
  (for DDL/`prisma db push`; sleeps when compute suspends). Both in Vercel.
- **No Prisma interactive transactions** (`$transaction`): PgBouncer transaction
  mode recycles connections mid-transaction → `P2028`. `app/api/setup` runs each
  query directly (safe for a single user). Keep it that way.
- `Exercise` string-array fields have `@default([])`; auto-created exercises must
  still pass empty arrays explicitly.

## Environment / tooling notes

- Dev is on **Windows / PowerShell** (a Bash tool is also available). Watch for
  **CRLF**: writing id/data files with Windows line endings and reading them in
  a loop appends stray `\r` — pull data straight from APIs or strip with `tr`.
- GitHub's REST API was intermittently **503 / "Unicorn"** during this work; the
  logs zip endpoint (`/actions/runs/<id>/logs`) is a reliable fallback for CI logs.
- Tests: `npm test`. API-route tests need the node (not jsdom) environment and
  were deferred — only `lib/yaml-parser.test.ts` exists (8 tests, 100% of the parser).

---

## Current state (as of v0.1.1)

- Video + Guide (description/tips/mistakes) fully supported in YAML → app,
  end-to-end. Both example programs carry bilingual guide content.
- Program switching + deletion implemented (`ProfileView`, `programs/*` routes).
- GitHub Deployments cleaned to just the live production record.

## Good first things for the next agent
- API-route tests under a node test environment (setup/activate/delete/logs).
- Optionally auto-tag on release-PR merge (needs the CI bot added as a `release`
  ruleset bypass actor).
- `.env.local` may contain a stray `VERCEL_OIDC_TOKEN` line (harmless, gitignored).
