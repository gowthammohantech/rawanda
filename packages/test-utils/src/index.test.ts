import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/test-utils", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/test-utils");
  });
});
