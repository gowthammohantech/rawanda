import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/mock-data",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
