import { describe, expect, it } from "vitest";

import { IllegalTransitionError } from "../errors.ts";
import { defineMachine } from "./define-machine.ts";

describe("defineMachine", () => {
  const machine = defineMachine<"a" | "b" | "c">("demo", { a: ["b"], b: ["c"], c: [] });

  it("reports legal transitions and next states", () => {
    expect(machine.can("a", "b")).toBe(true);
    expect(machine.can("a", "c")).toBe(false);
    expect(machine.next("b")).toEqual(["c"]);
    expect(machine.terminal).toEqual(["c"]);
  });

  it("throws IllegalTransitionError with machine, from and to", () => {
    expect(() => machine.assert("c", "a")).toThrow(IllegalTransitionError);
    try {
      machine.assert("c", "a");
    } catch (error) {
      expect(error).toMatchObject({
        name: "IllegalTransitionError",
        machine: "demo",
        from: "c",
        to: "a",
      });
    }
  });

  it("treats unknown states as having no transitions", () => {
    const loose = machine as unknown as {
      can(f: string, t: string): boolean;
      next(f: string): readonly string[];
    };
    expect(loose.can("zzz", "a")).toBe(false);
    expect(loose.next("zzz")).toEqual([]);
  });
});
