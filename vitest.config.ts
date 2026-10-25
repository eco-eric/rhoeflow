import { defineConfig } from "vitest/config";

// Vitest 3.2: one root config, one project per workspace package that has tests.
// Pinned to 3.x (esbuild/rollup) because Vitest 4's rolldown native binding is blocked by
// Windows Smart App Control on the dev machine; see claude/08-build/wo-01-build-log.md.
export default defineConfig({
  test: {
    projects: ["packages/*", "tools/*"],
    passWithNoTests: false,
  },
});
