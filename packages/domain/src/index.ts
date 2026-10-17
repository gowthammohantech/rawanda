/**
 * @laif/domain — pure TypeScript domain shared by all four apps (FND-02).
 * No React, no storage, no I/O, zero runtime dependencies.
 */
export const PACKAGE = "@laif/domain" as const;

export * from "./ids.ts";
export * from "./enums.ts";
export type * from "./entities/index.ts";
export * from "./machines/index.ts";
export * from "./invariants.ts";
export * from "./derive.ts";
export * from "./due-bucket.ts";
export * from "./queue.ts";
export * from "./matching.ts";
export * from "./rules/types.ts";
export * from "./rules/engine.ts";
export * from "./rules/explain.ts";
export * from "./clock/clock.ts";
export * from "./hash.ts";
export * from "./errors.ts";
export * from "./citizen/index.ts";
