import { nativeTestConfig, NATIVE_TEST_INLINE_DEPS } from "@laif/test-utils/native/vitest";
import { defineProject } from "vitest/config";

/**
 * FND-10 decision: one test runner repo-wide. Native components are tested under Vitest +
 * jsdom with `react-native` aliased to `react-native-web` (and `.web.*` platform files
 * preferred, as Expo web / Metro do) — the shared preset lives in `@laif/test-utils/native/vitest`
 * (FND-11). True device behaviour is covered by REL-03.
 */
export default defineProject({
  ...nativeTestConfig(import.meta.url),
  test: {
    name: "@laif/ui-native",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    server: { deps: { inline: NATIVE_TEST_INLINE_DEPS } },
  },
});
