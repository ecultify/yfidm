import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a slim, self-contained server at .next/standalone/server.js that
  // bundles only the deps actually used and listens on process.env.PORT. This
  // is the recommended way to self-host (e.g. on Hostinger) and uses far less
  // memory than `next start` loading the whole node_modules.
  output: "standalone",

  // This project lives inside a parent dir that also has a lockfile; pin the
  // workspace root so Next doesn't infer the wrong one.
  turbopack: {
    root: __dirname,
  },
  // Standalone tracing also needs the root pinned so it collects files from the
  // right place.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
