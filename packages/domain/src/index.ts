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
export * from "./rules/types.ts";
export * from "./rules/engine.ts";
export * from "./clock/clock.ts";
export * from "./hash.ts";
export * from "./errors.ts";
