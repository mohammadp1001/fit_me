import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
