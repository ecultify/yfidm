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

  // Caching policy that survives our hashed-asset deploys on Hostinger.
  //
  // The problem it fixes: every build gives JS/CSS chunks new content hashes.
  // If the HTML *document* gets cached anywhere (browser or LiteSpeed edge),
  // returning visitors get stale HTML that points at chunk hashes the new build
  // deleted -> 404 on everything until the cache expires. So:
  //   - /_next/static/*  : immutable hashed files, cache hard (1 year)
  //   - everything else  : never serve a stale document, always revalidate
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Everything except the immutable /_next/ assets.
        source: "/((?!_next/).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
