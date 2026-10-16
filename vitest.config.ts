import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "scripts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      exclude: ["PrototypeFourApplications-main/**", "ref-images/**", "**/node_modules/**"],
    },
  },
});
