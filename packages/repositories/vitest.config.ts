import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/repositories",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
