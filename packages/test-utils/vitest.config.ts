import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/test-utils",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
