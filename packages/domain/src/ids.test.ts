import { describe, expect, it } from "vitest";

import { asId, createSequentialIdGenerator, type PatientId } from "./ids.ts";
import * as domain from "./index.ts";

describe("ids", () => {
  it("createSequentialIdGenerator yields deterministic, independent sequences", () => {
    const pat = createSequentialIdGenerator("pat");
    expect([pat(), pat(), pat()]).toEqual(["pat-000001", "pat-000002", "pat-000003"]);
    const other = createSequentialIdGenerator("pat", 10);
    expect(other()).toBe("pat-000010");
  });

  it("asId brands without changing the value", () => {
    const id: PatientId = asId<PatientId>("pat-x");
    expect(id).toBe("pat-x");
  });

  it("the package index exposes the public API", () => {
    expect(domain.PACKAGE).toBe("@laif/domain");
    expect(typeof domain.evaluateScreening).toBe("function");
    expect(typeof domain.createDemoClock).toBe("function");
    expect(domain.reviewMachine.name).toBe("review");
  });
});
