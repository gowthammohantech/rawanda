import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/auth-demo",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
