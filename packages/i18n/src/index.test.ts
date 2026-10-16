import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/i18n", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/i18n");
  });
});
