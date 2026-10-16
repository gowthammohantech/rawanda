import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/repositories", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/repositories");
  });
});
