/** Shared argument checks of the persistent adapters (same messages as the memory adapter). */
import { isCollectionName, type CollectionName } from "./collections.ts";

export function assertCollection(c: string): asserts c is CollectionName {
  if (!isCollectionName(c)) throw new RangeError(`unknown collection: ${c}`);
}

export function assertId(value: { id?: unknown }): string {
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new TypeError("store documents need a non-empty string id");
  }
  return value.id;
}

export function assertMetaValue(v: unknown): asserts v is string {
  if (typeof v !== "string") throw new TypeError("meta values are strings");
}

/** JSON copy of a document (drops `undefined` members, like a reload would). */
export function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A promise chain that runs tasks one at a time; a failed task does not block later ones. */
export function createSerialQueue(): <R>(task: () => Promise<R>) => Promise<R> {
  let chain: Promise<unknown> = Promise.resolve();
  return <R>(task: () => Promise<R>): Promise<R> => {
    const run = chain.then(task);
    chain = run.catch(() => undefined);
    return run;
  };
}
