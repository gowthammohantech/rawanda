import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/analytics", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/analytics");
  });
});
