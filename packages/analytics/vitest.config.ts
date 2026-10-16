import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/analytics",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
