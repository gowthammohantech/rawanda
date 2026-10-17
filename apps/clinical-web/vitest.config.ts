import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  test: {
    name: "@laif/clinical-web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // Whole-app render tests (Boot seeding + router + Radix menus) exceed 5 s under CI load.
    testTimeout: 20_000,
  },
});
