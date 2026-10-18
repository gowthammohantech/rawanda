import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatMeasurement,
  formatNumber,
  formatRelativeToNow,
  formatTime,
  intlLocaleFor,
  KIGALI_TZ,
  kigaliDayEndUtc,
  kigaliDayStartUtc,
  resetFormatFeatureDetection,
  supportsIntlTimeZone,
} from "./format.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  resetFormatFeatureDetection();
});

describe("Kigali date/time formatting", () => {
  it("formats the demo clock instant as 08:00 Kigali on both engines", () => {
    expect(supportsIntlTimeZone()).toBe(true);
    const intl = formatDateTime(DEMO_CLOCK_DEFAULT_ISO, "en", { engine: "intl" });
    const manual = formatDateTime(DEMO_CLOCK_DEFAULT_ISO, "en", { engine: "manual" });
    expect(intl).toContain("08:00");
    expect(intl).toBe("14 Oct 2026, 08:00");
    expect(manual).toBe(intl);
    expect(formatDateTime("2026-10-14T06:00:00.000Z", "en")).toContain("08:00");
  });

  it("crosses midnight correctly: 2026-10-13T22:30Z is 14 Oct 00:30 in Kigali", () => {
    const iso = "2026-10-13T22:30:00.000Z";
    for (const engine of ["intl", "manual"] as const) {
      expect(formatDateTime(iso, "en", { engine })).toBe("14 Oct 2026, 00:30");
      expect(formatDate(iso, "en", { engine })).toBe("14 Oct 2026");
      expect(formatTime(iso, "en", { engine })).toBe("00:30");
      expect(formatDate(iso, "en", { engine, style: "long" })).toBe("Wednesday 14 October 2026");
      expect(formatDateTime(iso, "rw", { engine })).toBe("14 Ukw 2026, 00:30");
      expect(formatDate(iso, "rw", { engine, style: "long" })).toBe("Kuwa gatatu 14 Ukwakira 2026");
    }
  });

  it("produces identical output on both engines for many instants (EN and RW)", () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let i = 0; i < 400; i++) {
      const iso = new Date(start + i * 22 * 3_600_000 + i * 7 * 60_000).toISOString();
      for (const lng of ["en", "rw"] as const) {
        expect(formatDateTime(iso, lng, { engine: "intl" }), iso).toBe(
          formatDateTime(iso, lng, { engine: "manual" }),
        );
        expect(formatDate(iso, lng, { engine: "intl", style: "long" }), iso).toBe(
          formatDate(iso, lng, { engine: "manual", style: "long" }),
        );
      }
    }
  });

  it("ignores the device time zone (output is always Africa/Kigali)", () => {
    const original = process.env["TZ"];
    process.env["TZ"] = "America/Los_Angeles";
    try {
      expect(formatDateTime("2026-10-14T06:00:00.000Z", "en")).toBe("14 Oct 2026, 08:00");
    } finally {
      process.env["TZ"] = original;
    }
  });

  it("falls back to the manual engine when Intl lacks time-zone support (Hermes)", () => {
    const RealDTF = Intl.DateTimeFormat;
    const NoTz = function (locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      if (options?.timeZone !== undefined) throw new RangeError("timeZone not supported");
      return new RealDTF(locale, options);
    } as unknown as typeof Intl.DateTimeFormat;
    NoTz.supportedLocalesOf = () => [];
    vi.stubGlobal("Intl", { ...Intl, DateTimeFormat: NoTz });
    resetFormatFeatureDetection();
    expect(supportsIntlTimeZone()).toBe(false);
    expect(formatDateTime("2026-10-13T22:30:00.000Z", "en")).toBe("14 Oct 2026, 00:30");
    expect(() => formatDateTime("2026-10-13T22:30:00.000Z", "en", { engine: "intl" })).toThrow();
    expect(intlLocaleFor("rw")).toBe("en-GB");
  });

  it("uses rw-RW for Intl when the runtime knows it, else en-GB", () => {
    const known = Intl.DateTimeFormat.supportedLocalesOf(["rw-RW"]).length > 0;
    expect(intlLocaleFor("rw")).toBe(known ? "rw-RW" : "en-GB");
    expect(intlLocaleFor("en")).toBe("en-GB");
    expect(KIGALI_TZ).toBe("Africa/Kigali");
  });

  it("rejects invalid timestamps", () => {
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });
});

describe("formatRelativeToNow (demo clock, never wall time)", () => {
  const clock = createDemoClock();
  const at = (deltaMs: number) => new Date(clock.now().getTime() + deltaMs).toISOString();

  it("formats past and future in EN and RW", () => {
    expect(formatRelativeToNow(at(-20_000), clock)).toBe("just now");
    expect(formatRelativeToNow(at(-60_000), clock)).toBe("1 minute ago");
    expect(formatRelativeToNow(at(-3 * 3_600_000), clock)).toBe("3 hours ago");
    expect(formatRelativeToNow(at(86_400_000), clock)).toBe("in 1 day");
    expect(formatRelativeToNow(at(5 * 86_400_000), clock)).toBe("in 5 days");
    expect(formatRelativeToNow(at(-3 * 3_600_000), clock, "rw")).toBe("hashize amasaha 3");
    expect(formatRelativeToNow(at(86_400_000), clock, "rw")).toBe("mu munsi 1");
  });

  it("follows demo time travel", () => {
    const travelling = createDemoClock();
    const iso = travelling.nowIso();
    travelling.advanceBy(2 * 86_400_000);
    expect(formatRelativeToNow(iso, travelling)).toBe("2 days ago");
  });
});

describe("numbers and measurements", () => {
  it("always prints the unit", () => {
    expect(formatMeasurement(7.8, "mmol/L")).toBe("7.8 mmol/L");
    expect(formatMeasurement(7, "mmol/L")).toBe("7.0 mmol/L");
    expect(formatMeasurement(140, "mg/dL")).toBe("140 mg/dL");
    expect(formatMeasurement({ systolic: 148, diastolic: 92 }, "mmHg")).toBe("148/92 mmHg");
    expect(formatMeasurement({ systolic: 148, diastolic: 92 }, "mmHg", "rw")).toBe("148/92 mmHg");
    expect(formatMeasurement(1.25, "kg")).toBe("1.25 kg");
    expect(() => formatMeasurement(7, " ")).toThrow(RangeError);
  });

  it("formats numbers identically on both engines with '.' decimals in EN and RW", () => {
    for (const value of [0, 7.8, 1234.5, 1_000_000, -42.25, 0.125]) {
      for (const lng of ["en", "rw"] as const) {
        expect(formatNumber(value, lng, { engine: "manual" }), String(value)).toBe(
          formatNumber(value, lng),
        );
      }
    }
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatNumber(7.8, "rw", { minimumFractionDigits: 2 })).toBe("7.80");
  });
});

describe("Kigali calendar days → UTC range (CLN-10)", () => {
  it("maps a Kigali day onto its first / last UTC instant", () => {
    expect(kigaliDayStartUtc("2026-10-14")).toBe("2026-10-13T22:00:00.000Z");
    expect(kigaliDayEndUtc("2026-10-14")).toBe("2026-10-14T21:59:59.999Z");
    expect(kigaliDayStartUtc("2026-01-01")).toBe("2025-12-31T22:00:00.000Z");
  });

  it("rejects malformed or impossible days", () => {
    expect(() => kigaliDayStartUtc("14/10/2026")).toThrow(RangeError);
    expect(() => kigaliDayStartUtc("2026-02-30")).toThrow(RangeError);
  });
});
