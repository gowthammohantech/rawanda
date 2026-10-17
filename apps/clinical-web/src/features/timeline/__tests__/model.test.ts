/**
 * CLN-04 screening view model: newest first by effective `measuredAt`, Kigali-day grouping,
 * same-day repeat readings paired, display status from the screening + its review.
 */
import type { Review, Screening } from "@laif/domain";
import { createSeed, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { groupByDay, toScreeningEntries } from "../model.ts";

const seed = createSeed();
const base = seed.screenings.find(
  (s) => s.id === SEED_ANCHORS.AMENDED_SCREENING.screeningId,
) as Screening;
const at = (id: string, measuredAt: string, over: Partial<Screening> = {}): Screening => ({
  ...base,
  id: id as Screening["id"],
  measuredAt,
  amendments: [],
  ...over,
});

describe("toScreeningEntries", () => {
  it("sorts newest first, groups by Kigali day and pairs same-day repeat readings", () => {
    const entries = toScreeningEntries([
      at("s1", "2026-10-02T06:00:00.000Z"),
      // 23:30 UTC on 1 Oct is 01:30 on 2 Oct in Kigali → same Kigali day as s1.
      at("s2", "2026-10-01T23:30:00.000Z"),
      at("s3", "2026-10-05T07:00:00.000Z"),
      at("draft", "2026-10-06T07:00:00.000Z", { status: "draft" }),
    ]);
    expect(entries.map((e) => e.screening.id)).toEqual(["s3", "s1", "s2"]);
    expect(entries.find((e) => e.screening.id === "s1")?.pairedWith.map((p) => p.id)).toEqual([
      "s2",
    ]);
    expect(entries.find((e) => e.screening.id === "s3")?.pairedWith).toEqual([]);
    expect(groupByDay(entries).map((g) => [g.day, g.entries.length])).toEqual([
      ["2026-10-05", 1],
      ["2026-10-02", 2],
    ]);
  });

  it("uses the amended measuredAt and derives the display status", () => {
    const review = {
      ...(seed.reviews[0] as Review),
      screeningId: "flagged" as Review["screeningId"],
      status: "dismissed_with_reason",
    } as Review;
    const entries = toScreeningEntries(
      [
        at("flagged", "2026-10-03T06:00:00.000Z", { status: "review_required" }),
        at("moved", "2026-10-01T06:00:00.000Z", {
          amendments: [
            {
              id: "a1" as Screening["amendments"][number]["id"],
              field: "measuredAt",
              before: "2026-10-01T06:00:00.000Z",
              after: "2026-10-04T06:00:00.000Z",
              reason: "Wrong day entered on the device.",
              amendedBy: "persona-nurse-alpha2" as Screening["workerId"],
              amendedAt: "2026-10-05T06:00:00.000Z",
            },
          ],
        }),
      ],
      [review],
    );
    expect(entries.map((e) => [e.screening.id, e.status, e.amended])).toEqual([
      ["moved", "no_review_required", true],
      ["flagged", "reviewed", false],
    ]);
  });
});
