import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed from source in dev and from dist in production builds.
  transpilePackages: ["@rhoeflow/schema", "@rhoeflow/calc"],
  // No external CDN in the self-hosted/offline path (plan §Openness: "Browser assets").
  images: { unoptimized: true },
};

export default nextConfig;
