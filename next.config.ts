import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project lives inside a parent dir that also has a lockfile; pin the
  // workspace root so Next doesn't infer the wrong one.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
