import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed from source in dev and from dist in production builds.
  transpilePackages: ["@rhoeflow/schema", "@rhoeflow/calc", "@rhoeflow/hpxml", "@rhoeflow/templates", "@rhoeflow/jobstore", "@rhoeflow/jobstore-local", "@rhoeflow/store"],
  // No external CDN in the self-hosted/offline path (plan §Openness: "Browser assets").
  images: { unoptimized: true },
};

export default nextConfig;

// Gives `next dev` the same Cloudflare bindings the deployed worker sees (ADR-036).
initOpenNextCloudflareForDev();
