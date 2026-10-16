import { describe, expect, it } from "vitest";

import { createTestI18n } from "./testing.ts";

/**
 * Compile-time checks (run by `tsc --noEmit`): unknown keys are type errors. The runtime part
 * only asserts the valid keys resolve.
 */
describe("typed keys", () => {
  it("accepts known keys and rejects unknown ones at compile time", () => {
    const { t } = createTestI18n();
    expect(t("common:actions.save")).toBe("Save");
    expect(t("actions.save")).toBe("Save");
    expect(t("clinical:appName")).toContain("Clinical");

    const typeOnly = () => {
      // @ts-expect-error — not a key of namespace `common`
      t("common:doesNotExist");
      // @ts-expect-error — misspelt namespace
      t("comon:actions.save");
      // @ts-expect-error — misspelt nested key
      t("validation:reasonTooShortt");
    };
    expect(typeof typeOnly).toBe("function");
  });
});
