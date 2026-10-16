/**
 * @laif/i18n — offline English ⇄ Kinyarwanda for all four apps (FND-04).
 *
 * Platform storage adapters live in separate entries: `@laif/i18n/web` and `@laif/i18n/native`.
 */
import "./types.ts";

export const PACKAGE = "@laif/i18n" as const;

export * from "./languages.ts";
export * from "./resources.ts";
export * from "./storage.ts";
export * from "./create-i18n.ts";
export * from "./missing.ts";
export * from "./validation.ts";
export * from "./format.ts";
export * from "./domain-keys.ts";
export * from "./react.tsx";
export * from "./testing.ts";
