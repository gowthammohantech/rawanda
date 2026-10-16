import { nativeTestConfig, NATIVE_TEST_INLINE_DEPS } from "@laif/test-utils/native/vitest";
import { defineProject } from "vitest/config";

/** Vitest + jsdom + react-native-web (FND-10 runner decision, shared preset from FND-11). */
export default defineProject({
  ...nativeTestConfig(import.meta.url),
  test: {
    name: "@laif/worker-mobile",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    server: { deps: { inline: NATIVE_TEST_INLINE_DEPS } },
  },
});
