import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/contracts",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
