import { expect } from "vitest";

import { IllegalTransitionError } from "../errors.ts";
import type { Machine } from "../machines/define-machine.ts";

/**
 * Exhaustively checks a machine against the expected legal edges: every listed pair passes
 * `can()` / `assert()`, every other (from, to) pair over `allStates` fails `can()` and makes
 * `assert()` throw `IllegalTransitionError`.
 */
export function expectExactTransitions<S extends string>(
  machine: Machine<S>,
  allStates: readonly S[],
  legal: ReadonlyArray<readonly [S, S]>,
): void {
  expect([...machine.states].sort()).toEqual([...allStates].sort());
  const isLegal = (from: S, to: S) => legal.some(([f, t]) => f === from && t === to);

  for (const from of allStates) {
    for (const to of allStates) {
      if (isLegal(from, to)) {
        expect(machine.can(from, to), `${from} -> ${to} should be legal`).toBe(true);
        expect(() => machine.assert(from, to)).not.toThrow();
      } else {
        expect(machine.can(from, to), `${from} -> ${to} should be illegal`).toBe(false);
        let thrown: unknown;
        try {
          machine.assert(from, to);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(IllegalTransitionError);
        expect(thrown).toMatchObject({ machine: machine.name, from, to });
      }
    }
    expect([...machine.next(from)].sort()).toEqual(
      legal
        .filter(([f]) => f === from)
        .map(([, t]) => t)
        .sort(),
    );
  }
}
