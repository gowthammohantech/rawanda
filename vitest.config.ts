import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "scripts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      exclude: ["PrototypeFourApplications-main/**", "ref-images/**", "**/node_modules/**"],
      // Per-phase coverage gates (applied when run with --coverage).
      thresholds: {
        // FND-02: ≥ 95% lines in the domain machines, rules engine and invariants.
        "packages/domain/src/machines/**": { lines: 95 },
        "packages/domain/src/rules/**": { lines: 95 },
        "packages/domain/src/invariants.ts": { lines: 95 },
      },
    },
  },
});
