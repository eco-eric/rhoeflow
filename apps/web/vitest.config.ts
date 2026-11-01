import { defineConfig } from "vitest/config";

// Unit tests for the web app's pure helpers (no Next.js runtime).
export default defineConfig({ test: { include: ["test/**/*.test.ts"], environment: "node" } });
