import { IllegalTransitionError } from "../errors.ts";

export type Machine<S extends string> = {
  readonly name: string;
  readonly states: readonly S[];
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  /** True when `from → to` is a legal transition. */
  can(from: S, to: S): boolean;
  /** Throws `IllegalTransitionError` unless `from → to` is legal. */
  assert(from: S, to: S): void;
  /** Legal next states from `from`. */
  next(from: S): readonly S[];
  /** States with no outgoing transitions. */
  readonly terminal: S[];
};

/**
 * Declares a finite state machine from an explicit transition table. Every state must be a
 * key (terminal states map to `[]`), so adding a status forces a decision about its edges.
 */
export function defineMachine<S extends string>(
  name: string,
  transitions: Record<S, readonly S[]>,
): Machine<S> {
  const states = Object.keys(transitions) as S[];
  const table = Object.freeze({ ...transitions });
  const has = (from: S, to: S): boolean => Object.hasOwn(table, from) && table[from].includes(to);

  return Object.freeze({
    name,
    states,
    transitions: table,
    can: has,
    assert(from: S, to: S): void {
      if (!has(from, to)) throw new IllegalTransitionError(name, from, to);
    },
    next(from: S): readonly S[] {
      return Object.hasOwn(table, from) ? table[from] : [];
    },
    terminal: states.filter((state) => table[state].length === 0),
  });
}
