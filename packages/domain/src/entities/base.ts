/** Fields shared by every persisted entity. */
export type PersistedEntity = {
  // ext: optimistic concurrency (spec §4 409 on stale writes); starts at 1.
  version: number;
  // ext: ISO 8601 UTC strings (`…Z`).
  createdAt: string;
  updatedAt: string;
  // ext: privacy assertion hook — every record in the prototype is synthetic.
  synthetic: true;
};

/** ISO 8601 UTC timestamp string (`2026-10-14T06:00:00.000Z`). Validated in FND-03. */
export type IsoUtc = string;

/** JSON-serialisable value (sync payloads, audit summaries, server snapshots). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
