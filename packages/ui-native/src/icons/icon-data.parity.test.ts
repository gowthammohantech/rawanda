import * as web from "@laif/ui-web/icon-data";
import { describe, expect, it } from "vitest";

import { ICON_DATA, ICON_NAMES } from "./icon-data.ts";

describe("icon set parity with @laif/ui-web", () => {
  it("has the same IconName set", () => {
    expect([...ICON_NAMES]).toEqual([...web.ICON_NAMES]);
  });

  it("has identical path data", () => {
    expect(ICON_DATA).toEqual(web.ICON_DATA);
  });
});
