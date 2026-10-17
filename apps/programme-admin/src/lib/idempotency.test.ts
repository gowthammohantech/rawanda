import { IdempotencyKey } from "@laif/contracts";
import { describe, expect, it } from "vitest";

import { createOnceRegistry, makeIdempotencyKey } from "./idempotency.ts";

describe("makeIdempotencyKey", () => {
  it("is stable, UUID-shaped and order-sensitive", () => {
    const key = makeIdempotencyKey([
      "persona-analyst-alpha",
      "/admin/overview",
      "?district=b",
      "k1",
    ]);
    expect(
      makeIdempotencyKey(["persona-analyst-alpha", "/admin/overview", "?district=b", "k1"]),
    ).toBe(key);
    expect(IdempotencyKey.safeParse(key).success).toBe(true);
    expect(makeIdempotencyKey(["k1", "persona-analyst-alpha"])).not.toBe(
      makeIdempotencyKey(["persona-analyst-alpha", "k1"]),
    );
    expect(makeIdempotencyKey(["a,b"])).not.toBe(makeIdempotencyKey(["a", "b"]));
  });
});

describe("createOnceRegistry", () => {
  it("claims each key once and forgets the oldest past the limit", () => {
    const once = createOnceRegistry(2);
    expect(once.claim("a")).toBe(true);
    expect(once.claim("a")).toBe(false);
    once.claim("b");
    once.claim("c");
    expect(once.claim("a")).toBe(true);
  });
});
