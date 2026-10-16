import { describe, expect, it } from "vitest";

import { canonicalJson, fnv1a64Hex, hashCanonical } from "./hash.ts";

describe("canonicalJson", () => {
  it("is independent of key order, recursively", () => {
    const a = { b: 1, a: { y: [1, { d: 2, c: 3 }], x: "s" } };
    const b = { a: { x: "s", y: [1, { c: 3, d: 2 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"x":"s","y":[1,{"c":3,"d":2}]},"b":1}');
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("keeps array order significant", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("matches JSON semantics for primitives, undefined members and dates", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson('é"')).toBe(JSON.stringify('é"'));
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([undefined])).toBe("[null]");
    expect(canonicalJson(new Date("2026-10-14T06:00:00.000Z"))).toBe('"2026-10-14T06:00:00.000Z"');
  });

  it("rejects values that cannot be serialised losslessly", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalJson(BigInt(1))).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
  });
});

describe("fnv1a64Hex", () => {
  it("matches the published FNV-1a 64-bit test vectors", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("returns 16 lowercase hex chars and hashes UTF-8 bytes", () => {
    expect(fnv1a64Hex("Muraho, Kigali — ü")).toMatch(/^[0-9a-f]{16}$/u);
    expect(fnv1a64Hex("ü")).not.toBe(fnv1a64Hex("u"));
  });
});
