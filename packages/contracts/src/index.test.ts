import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/contracts", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/contracts");
  });
});
