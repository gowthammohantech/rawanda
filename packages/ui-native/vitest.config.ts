import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/ui-native",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
