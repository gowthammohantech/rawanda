# FND-08 — Dexie (web) and expo-sqlite (native) store adapters + @laif/test-utils

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | FND-08 |
| Title | Persistent store adapters and shared test utilities |
| App | Shared (`packages/repositories`, `packages/test-utils`) |
| Depends on | FND-07 |
| Trace | ADR-P04; tech spec §2.2 offline requirement ("save to SQLite before network", "survives restart"), §8 worker rows, §9 unit/integration; HW-05, HW-08 |
| Size | M |

## 2. Goal

The same repository logic persists to IndexedDB in the web apps and to SQLite in the Expo apps, so records, the sync queue, idempotency records, demo meta and audit survive a reload/app restart. Every app track gets ready-made factories, a seeded in-memory repository and render helpers for tests.

## 3. Scope

**In scope:** `createDexieStoreAdapter`, `createSqliteStoreAdapter`, runtime ID generators per platform, subpath exports so web bundles never import native modules and vice versa, contract-suite runs for both adapters, `@laif/test-utils` package contents.

**Out of scope:** SQLCipher/at-rest encryption (HW-05 "encrypt locally" is shown as a labelled limitation — PO decision, see INDEX), React providers (apps own them).

## 4. Deliverables

```text
packages/repositories/src/
  store/dexie-adapter.ts        # createDexieStoreAdapter({ dbName }) ; export via "@laif/repositories/dexie"
  store/sqlite-adapter.ts       # createSqliteStoreAdapter(executor: SqlExecutor) ; export via "@laif/repositories/sqlite"
  store/sql-executor.ts         # interface SqlExecutor (subset of expo-sqlite SQLiteDatabase async API)
  store/expo-sqlite-executor.ts # openExpoSqliteExecutor(name) ; export via "@laif/repositories/expo-sqlite"
  ids/web.ts, ids/native.ts     # createWebIdGenerator() (crypto.randomUUID), createNativeIdGenerator() (expo-crypto randomUUID)
packages/repositories/package.json  # "exports": { ".", "./dexie", "./sqlite", "./expo-sqlite", "./ids/web", "./ids/native" }
packages/test-utils/src/
  factories.ts      # buildPatient(overrides), buildScreening, buildReview, buildReferral, buildFollowUp, buildActor(role, scope)
  repo.ts           # createTestRepository({ persona?, scenario?, faults? }) → { repo, store, clock, advance(ms) }
  clock.ts          # createTestClock(iso?)
  i18n.ts           # re-export createTestI18n from @laif/i18n
  matchers.ts       # expectRepositoryError(promise, code)
  index.ts
```

## 5. Implementation tasks

1. **Dexie adapter** — pin Dexie 4.x. Database `laif-<appId>` — exactly `laif-clinical`, `laif-admin` (and `laif-worker` / `laif-citizen` for the Expo **web** target); CLN phase text saying `laif-clinical-web` means `laif-clinical`. Version 1, one table per collection from the FND-07 `COLLECTIONS` registry (incl. admin and citizen collections) with schema `'id, patientId, facilityId, status, updatedAt'` (indexes reserved for future use; filtering still in JS), plus `meta: 'key'`. `transaction(fn)` → `db.transaction('rw', db.tables, () => fn(txAdapter))`; no non-Dexie awaits inside (clock and ID generator are synchronous). `clearAll` clears every table in one transaction. `VersionError`/`QuotaExceededError` → `RepositoryError('DEPENDENCY_UNAVAILABLE')`.
2. **SQLite adapter** — schema (decision: single document table with JSON payloads):
   ```sql
   CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL,
     updated_at TEXT NOT NULL, PRIMARY KEY (collection, id));
   CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
   CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   PRAGMA journal_mode = WAL;
   ```
   There is **no per-app SQL migration API**: new collections are rows in `records`, so app phases never write `0001_*.ts` / `ctz_0001_init.sql` migrations; `PRAGMA user_version` is owned by this adapter only. `SqlExecutor = { execAsync(sql); runAsync(sql, params); getAllAsync<T>(sql, params); getFirstAsync<T>(sql, params); withExclusiveTransactionAsync(fn) }` — the subset of `expo-sqlite`'s `SQLiteDatabase` (SDK pinned in FND-11). Transactions use `withExclusiveTransactionAsync` so concurrent `sync.process()` calls serialize.
3. `openExpoSqliteExecutor(name)` wraps `SQLite.openDatabaseAsync('laif-<appId>.db')`; `expo-sqlite` is an **optional peerDependency** of `@laif/repositories`, imported only from the `./expo-sqlite` entry.
4. **Node test harness for SQLite**: devDependency `better-sqlite3`; `test/better-sqlite-executor.ts` implements `SqlExecutor` over an in-memory DB, so the adapter's SQL runs for real under Vitest. Dexie tests use `fake-indexeddb/auto`.
5. Run `runStoreAdapterContract` for both adapters; add persistence tests: write → close → reopen → data present (simulates reload/app restart; tech spec §8 "survives app restart").
6. Run the FND-07 workflow tests (`wf01`, sync/WF-02, reset) parametrised over all three adapters (`describe.each`).
7. ID generators: `createWebIdGenerator()` uses `globalThis.crypto.randomUUID`; `createNativeIdGenerator()` uses `expo-crypto` `randomUUID` (optional peer). Seeds keep deterministic IDs; only runtime-created records use these.
8. **test-utils**: factories produce schema-valid entities with `synthetic: true` and sequential IDs; `createTestRepository` = memory adapter + `createTestClock(DEMO_CLOCK_DEFAULT_ISO)` + seeded slice + selected persona; `expectRepositoryError(p, 'CONFLICT', reason?)`; `createTestSqliteExecutor()` (better-sqlite3, exported from `@laif/test-utils/sqlite`) is the Node SQLite shim app tracks use — there is no jest-expo shim; native tests run under Vitest (FND-10). `readStoreCollection(store, name)` replaces the ADM-proposed `readDexieTable`. App tracks may add fixtures here (`adminMetricsFixture`, `renderWithAdmin`, citizen factories, `expectMinTouchTarget`, `walkAllRoutes`). Web render helpers (`renderWithProviders`) are added in FND-09 and native ones in FND-10 under `@laif/test-utils/web` and `@laif/test-utils/native`.

## 6. Data, state and audit

Persists every collection. Invariants: a failed transaction leaves zero partial writes (tested by throwing mid-transaction); sync queue order (`localSeq`) is preserved across restart; audit append-only behaviour identical across adapters.

## 7. UX states

Enables the **offline** and "Saved on this device" states to survive restart; storage failures surface as `DEPENDENCY_UNAVAILABLE` → server-error state with a "Reset demo" hint.

## 8. i18n

Only `common:error.storageUnavailable` (EN + RW) for quota/version failures.

## 9. Acceptance criteria

- [ ] Contract suite green for memory, Dexie (fake-indexeddb) and SQLite (better-sqlite3).
- [ ] Reopen test: queued sync ops and a draft screening persist across adapter re-creation for Dexie and SQLite.
- [ ] Throwing inside `transaction` rolls back all writes on both adapters.
- [ ] Importing the root `@laif/repositories` entry with `dexie` and `expo-sqlite` mocked to throw on import still succeeds (entry isolation).
- [ ] `createTestRepository({ scenario: 'SCN-09-version-conflict' })` yields a queued op whose processing ends in `needs_resolution`.
- [ ] `pnpm verify` green.

## 10. Tests

`src/store/dexie-adapter.test.ts`, `src/store/sqlite-adapter.test.ts`, `src/store/persistence-reopen.test.ts`, `src/workflows/adapters.matrix.test.ts`, `src/entry-isolation.test.ts`, `packages/test-utils/src/factories.test.ts`.

## 11. Verification

```bash
pnpm --filter @laif/repositories --filter @laif/test-utils typecheck
pnpm vitest run --project @laif/repositories --project @laif/test-utils
pnpm verify
```

## 12. Commit

`feat(repositories): FND-08 dexie and expo-sqlite store adapters with restart persistence; add test-utils`
