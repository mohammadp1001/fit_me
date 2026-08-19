import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Nothing outside `lib/db/` and `lib/oauth/` may import the Prisma client.
 *
 * This is the enforcement half of the data-access layer (#58). Every function
 * in `lib/db/*` takes `userId` as a required argument, so a forgotten filter is
 * a compile error - but only if the query goes through `lib/db` at all. Without
 * this rule, a new route handler could reach for `prisma` directly and write an
 * unscoped query that reads every user's rows, and nothing would notice.
 *
 * `lib/oauth/` is exempt, and that was revisited in #61 rather than left
 * standing out of habit. `OAuthCode` and `OAuthToken` did gain a `userId`, but
 * the exemption still earns its place: these modules issue and verify
 * credentials *before* there is an authenticated user to scope by. Their
 * queries are keyed on a token hash, not on an owner, so routing them through
 * `lib/db/*` would mean inventing a `userId` argument they cannot have.
 *
 * The user-scoped question they answer - "which account does this token act
 * as?" - is returned by `verifyAccessToken` and enforced downstream, where the
 * MCP tools take that id as a required argument.
 */
const prismaRestriction = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: [
    "lib/db/**",
    "lib/oauth/**",
    // The singleton itself, and the seed script, which runs standalone against
    // an empty database before any user exists.
    "lib/prisma.ts",
    "prisma/**",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/prisma",
            message:
              "Route handlers and components must not query Prisma directly. " +
              "Add a function to lib/db/* that takes userId as its first " +
              "argument and call that instead - see HANDOFF.md, 'Planned: " +
              "multi-user accounts'.",
          },
        ],
        patterns: [
          {
            group: ["**/lib/prisma", "**/prisma/client", "@prisma/client"],
            importNames: ["PrismaClient"],
            message:
              "Constructing a PrismaClient outside lib/db bypasses the " +
              "userId-scoped data layer. Use lib/db/* instead.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    // Agent worktrees are full checkouts of this repo; linting them reports
    // thousands of findings from their own (and their bundles') copies.
    ".claude/**",
    "next-env.d.ts",
    "jest.config.js",
    "public/sw.js",
    "public/workbox-*.js",
  ]),
  prismaRestriction,
  {
    // Test suites build their own fixtures against a real database, which is
    // the point of them - they are not application code paths.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // `_userId` parameters in lib/db mark arguments that are required by the
    // interface but not yet used by the query - `GlobalMemory` and
    // `Suggestion` gain their owner in #59. Keeping the parameter now means
    // the call sites are already correct.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
