import { describe, expect, it } from "vitest";

import { PACKAGE } from "./index.ts";

describe("@laif/ui-native", () => {
  it("exports its package name", () => {
    expect(PACKAGE).toBe("@laif/ui-native");
  });
});
