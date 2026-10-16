import { describe, expect, it } from "vitest";

import { datasetHash } from "../hash.ts";
import { createSeed } from "./generate.ts";
import { SEED_DATASET_HASH } from "./seed.snapshot.ts";

describe("createSeed determinism", () => {
  it("returns deep-equal datasets on every call", () => {
    expect(createSeed()).toEqual(createSeed());
  });

  it("matches the committed dataset hash (update seed.snapshot.ts consciously)", () => {
    expect(datasetHash(createSeed())).toBe(SEED_DATASET_HASH);
  });

  it("records the meta block", () => {
    expect(createSeed().meta).toEqual({
      seedVersion: "seed-v1",
      seed: 20261016,
      demoClockIso: "2026-10-14T06:00:00.000Z",
      generatedFor: "SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE",
    });
  });

  it("keeps IDs stable when only the PRNG seed changes (names / readings vary)", () => {
    const a = createSeed();
    const b = createSeed({ seed: 7 });
    expect(b.patients.map((p) => p.id)).toEqual(a.patients.map((p) => p.id));
    expect(b.screenings.map((s) => [s.id, s.status])).toEqual(
      a.screenings.map((s) => [s.id, s.status]),
    );
    expect(datasetHash(b)).not.toBe(datasetHash(a));
  });

  it("offsets every timestamp from nowIso", () => {
    const shifted = createSeed({ nowIso: "2026-10-15T06:00:00.000Z" });
    const base = createSeed();
    const day = 86_400_000;
    expect(Date.parse(shifted.screenings[0]?.measuredAt ?? "")).toBe(
      Date.parse(base.screenings[0]?.measuredAt ?? "") + day,
    );
  });
});
