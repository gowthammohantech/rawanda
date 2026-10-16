import { describe, expect, it } from "vitest";

import { DEMO_CLOCK_DEFAULT_ISO, createDemoClock, createSystemClock } from "./clock.ts";

describe("createDemoClock", () => {
  it("defaults to the pinned demo instant in frozen mode", () => {
    const clock = createDemoClock();
    expect(DEMO_CLOCK_DEFAULT_ISO).toBe("2026-10-14T06:00:00.000Z");
    expect(clock.mode).toBe("frozen");
    expect(clock.nowIso()).toBe("2026-10-14T06:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-14T06:00:00.000Z");
    expect(clock.nowIso()).toBe(clock.nowIso());
  });

  it("is 08:00 in Africa/Kigali on a Wednesday", () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Kigali",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(DEMO_CLOCK_DEFAULT_ISO));
    expect(parts).toBe("Wednesday 08:00");
  });

  it("accepts a custom pinned instant and normalises it to UTC", () => {
    const clock = createDemoClock({ pinnedIso: "2026-10-20T10:00:00+02:00" });
    expect(clock.nowIso()).toBe("2026-10-20T08:00:00.000Z");
    expect(clock.pinnedIso).toBe("2026-10-20T08:00:00.000Z");
  });

  it("rejects an invalid pinned instant", () => {
    expect(() => createDemoClock({ pinnedIso: "nope" })).toThrow(RangeError);
  });

  it("advanceBy moves frozen time; reset returns to the pinned instant", () => {
    const clock = createDemoClock();
    clock.advanceBy(24 * 60 * 60 * 1000);
    expect(clock.nowIso()).toBe("2026-10-15T06:00:00.000Z");
    clock.advanceBy(-60 * 60 * 1000);
    expect(clock.nowIso()).toBe("2026-10-15T05:00:00.000Z");
    clock.reset();
    expect(clock.nowIso()).toBe(DEMO_CLOCK_DEFAULT_ISO);
  });

  it("ticking mode advances with elapsed wall time from the pinned instant", () => {
    let wall = 1_000_000;
    const clock = createDemoClock({ mode: "ticking", wallNow: () => wall });
    expect(clock.nowIso()).toBe(DEMO_CLOCK_DEFAULT_ISO);
    wall += 90_000;
    expect(clock.nowIso()).toBe("2026-10-14T06:01:30.000Z");
    clock.advanceBy(60 * 60 * 1000);
    expect(clock.nowIso()).toBe("2026-10-14T07:01:30.000Z");
    clock.reset();
    expect(clock.nowIso()).toBe(DEMO_CLOCK_DEFAULT_ISO);
  });

  it("ticking mode uses the real wall clock by default", () => {
    const clock = createDemoClock({ mode: "ticking" });
    const first = clock.now().getTime();
    expect(first).toBeGreaterThanOrEqual(Date.parse(DEMO_CLOCK_DEFAULT_ISO));
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(first);
  });
});

describe("createSystemClock", () => {
  it("returns the real current time", () => {
    const clock = createSystemClock();
    const before = Date.now();
    const value = clock.now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(Date.parse(clock.nowIso())).toBeGreaterThanOrEqual(value);
  });
});
