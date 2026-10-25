import { defineConfig } from "vitest/config";

// Vitest 4: one root config, one project per workspace package that has tests.
export default defineConfig({
  test: {
    projects: ["packages/*", "tools/*"],
    passWithNoTests: false,
  },
});
