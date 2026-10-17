/**
 * Spec §5.1 "no patient names into analytics": no result type may contain a `displayName`,
 * `patientId` or `syntheticIdentifier` field at any depth (type-level), and no seed patient's
 * name or identifier appears in any computed result (runtime).
 */
import { createDemoClock } from "@laif/domain";
import { createSeed } from "@laif/mock-data";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AggregateCell,
  CellList,
  FacilityCount,
  NeedsAttention,
  ScreeningTypeCounts,
  WeeklyScreenedVsFlagged,
  DataQuality,
  PathwayFunnel,
  ProgrammeMetrics,
  ScreeningOverview,
  SuppressedTable,
  Timeliness,
  WorkerWorkload,
} from "./index.ts";
import { getProgrammeMetrics, metricTable, suppressCells, COUNT_METRIC_KEYS } from "./index.ts";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/** Every property name reachable in T (through arrays, records and unions). */
type DeepKeys<T> = T extends Primitive
  ? never
  : T extends ReadonlyArray<infer U>
    ? DeepKeys<U>
    : T extends object
      ? { [K in keyof T]-?: K | DeepKeys<T[K]> }[keyof T]
      : never;

type Forbidden = "displayName" | "patientId" | "syntheticIdentifier";

describe("no PII in analytics result types", () => {
  it("DeepKeys sees nested fields (self-test)", () => {
    expectTypeOf<
      Extract<DeepKeys<{ a: { b: Array<{ patientId: string }> } }>, Forbidden>
    >().toEqualTypeOf<"patientId">();
  });

  it("no result type has a forbidden field", () => {
    expectTypeOf<Extract<DeepKeys<ProgrammeMetrics>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<ScreeningOverview>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<PathwayFunnel>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<Timeliness>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<WorkerWorkload>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<DataQuality>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<SuppressedTable>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<AggregateCell>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<CellList>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<FacilityCount>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<NeedsAttention>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<ScreeningTypeCounts>, Forbidden>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<WeeklyScreenedVsFlagged>, Forbidden>>().toBeNever();
  });

  it("computed results contain no patient names, ids or synthetic identifiers", () => {
    const seed = createSeed();
    const now = createDemoClock().now();
    const json = JSON.stringify([
      getProgrammeMetrics(seed, {}, now),
      suppressCells(
        metricTable(seed, {}, now, { groupBy: "facility", metricKeys: COUNT_METRIC_KEYS }),
      ),
    ]);
    for (const p of seed.patients) {
      expect(json).not.toContain(`"${p.id}"`);
      expect(json).not.toContain(p.displayName);
      expect(json).not.toContain(p.syntheticIdentifier);
    }
  });
});
