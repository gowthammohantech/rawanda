import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/domain",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
