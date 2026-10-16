import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@laif/ui-web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
