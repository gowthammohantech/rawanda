/**
 * Storage failures of the persistent adapters (FND-08): IndexedDB `VersionError` /
 * `QuotaExceededError` / closed or blocked databases, SQLite I/O or "database is full" errors.
 * They surface as `RepositoryError('DEPENDENCY_UNAVAILABLE')` so the UI shows the server-error
 * state with the `common:error.storageUnavailable` copy and a "Reset demo" hint.
 */
import { RepositoryError } from "../errors.ts";

export type StorageEngine = "dexie" | "sqlite";

/** i18n key apps render for a storage failure (EN + RW in `common`). */
export const STORAGE_UNAVAILABLE_MESSAGE_KEY = "common:error.storageUnavailable" as const;

function errorName(error: unknown): string {
  if (error instanceof Error || (typeof error === "object" && error !== null && "name" in error)) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "Error";
}

/** Wraps a low-level storage error; a `RepositoryError` passes through unchanged. */
export function toStorageError(engine: StorageEngine, error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RepositoryError("DEPENDENCY_UNAVAILABLE", {
    message: `storage unavailable (${engine}: ${errorName(error)})`,
    details: {
      storage: engine,
      errorName: errorName(error),
      message,
      messageKey: STORAGE_UNAVAILABLE_MESSAGE_KEY,
    },
  });
}

/** True when `error` is a mapped storage failure. */
export function isStorageUnavailableError(error: unknown): error is RepositoryError {
  return (
    error instanceof RepositoryError &&
    error.code === "DEPENDENCY_UNAVAILABLE" &&
    error.details["messageKey"] === STORAGE_UNAVAILABLE_MESSAGE_KEY
  );
}

/**
 * Runs a transaction body through `run` and maps failures of the storage machinery only:
 * whatever the callback itself rejects with propagates unchanged (contract: "the rejection
 * propagates").
 */
export async function runMappedTransaction<C, R>(
  engine: StorageEngine,
  run: (body: (ctx: C) => Promise<R>) => Promise<R>,
  body: (ctx: C) => Promise<R>,
): Promise<R> {
  let thrown: { error: unknown } | null = null;
  try {
    return await run(async (ctx) => {
      try {
        return await body(ctx);
      } catch (error) {
        thrown = { error };
        throw error;
      }
    });
  } catch (error) {
    const own = thrown as { error: unknown } | null;
    if (own) throw own.error;
    throw toStorageError(engine, error);
  }
}
