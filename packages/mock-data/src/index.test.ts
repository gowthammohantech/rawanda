import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/mock-data", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/mock-data");
  });
});
