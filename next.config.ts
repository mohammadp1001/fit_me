import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = withNextIntl(
  withPWA({
    // `get_program_schema` reads `examples/TEMPLATE.yaml` from disk at request
    // time so the schema the chatbot sees is the same annotated file the parser
    // is verified against - one source of truth, no generated copy to drift.
    // Nothing imports the YAML, so tracing cannot infer it and the file would
    // otherwise be absent from the serverless bundle.
    outputFileTracingIncludes: {
      "/api/mcp": ["./examples/TEMPLATE.yaml"],
    },
  }),
);

export default nextConfig;
