/**
 * @laif/test-utils — shared test helpers for every app track (FND-08): entity factories, a seeded
 * in-memory `createTestRepository`, the pinned test clock, `createTestI18n`, repository-error
 * matcher and `readStoreCollection`. The Node SQLite shim is `@laif/test-utils/sqlite`; web /
 * native render helpers arrive in FND-09 / FND-10 under `@laif/test-utils/web` / `/native`.
 */
export const PACKAGE = "@laif/test-utils" as const;

export * from "./clock.ts";
export * from "./factories.ts";
export * from "./i18n.ts";
export * from "./matchers.ts";
export * from "./repo.ts";
export * from "./store.ts";
export * from "./citizen/index.ts";
