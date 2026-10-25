import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed from source in dev and from dist in production builds.
  transpilePackages: ["@rhoeflow/schema", "@rhoeflow/calc", "@rhoeflow/hpxml", "@rhoeflow/templates", "@rhoeflow/jobstore", "@rhoeflow/jobstore-local", "@rhoeflow/jobstore-workedge", "@rhoeflow/store"],
  // No external CDN in the self-hosted/offline path (plan §Openness: "Browser assets").
  images: { unoptimized: true },
  // `next dev` resolves workspace packages to their TypeScript sources (the "development" export
  // condition), which import siblings as `./x.js` (NodeNext style). Turbopack cannot map those to
  // `.ts`, so dev runs on webpack with this alias (package.json "dev"). Production builds read the
  // compiled dist/ and are unaffected.
  // Production builds stay on Turbopack (the Next 16 default) and read dist/.
  turbopack: {},
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;

// Gives `next dev` the same Cloudflare bindings the deployed worker sees (ADR-036).
initOpenNextCloudflareForDev();
