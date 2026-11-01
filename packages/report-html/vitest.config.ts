import { defineProject } from "vitest/config";

// The PDF check launches a browser per fixture batch; give it room.
export default defineProject({
  test: { testTimeout: 120_000, hookTimeout: 120_000 },
});
