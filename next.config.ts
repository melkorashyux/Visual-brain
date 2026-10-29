import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Produces .next/standalone: a self-contained server + pruned
  // node_modules, used to package the Electron desktop build.
  output: "standalone",
  // Backstop for the turbopackIgnore in lib/paths.ts: none of these are
  // needed at runtime, and release/ holds previous installers.
  outputFileTracingExcludes: {
    "/*": [
      "./release/**/*",
      "./data/**/*",
      "./.git/**/*",
      "./.github/**/*",
      "./extension/**/*",
      "./electron/**/*",
      "./scripts/**/*",
      "./build/**/*",
      "./*.md",
      "./*.png",
    ],
  },
};

export default nextConfig;
