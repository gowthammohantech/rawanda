import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "scripts",
    environment: "node",
    // i18n-check tests spawn the script over the whole monorepo (all four apps), which can exceed 5 s.
    testTimeout: 60_000,
    include: ["*.test.ts"],
  },
});
