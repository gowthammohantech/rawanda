/**
 * MetricsFilter application (FND-06): date range in Kigali calendar days + district / facility
 * scope, with cohort attribution — reviews, referrals and follow-ups belong to the period of the
 * screening they originate from (no misleading denominators).
 */
import type { DistrictId, FacilityId, ReferralId, ReviewId, ScreeningId } from "@laif/domain";

import type { AnalyticsInput, MetricsFilter } from "./types.ts";

/** Africa/Kigali is UTC+2 all year (no DST). */
export const KIGALI_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Kigali calendar day `YYYY-MM-DD` of a UTC instant. */
export function kigaliDate(instant: string | Date): string {
  const ms = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  if (Number.isNaN(ms)) throw new RangeError(`invalid instant ${String(instant)}`);
  return new Date(ms + KIGALI_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday (`YYYY-MM-DD`) of the ISO week containing the Kigali day of `instant`. */
export function kigaliIsoWeekStart(instant: string | Date): string {
  return isoWeekStartOfDay(kigaliDate(instant));
}

/** Monday of the ISO week of a calendar day `YYYY-MM-DD`. */
export function isoWeekStartOfDay(day: string): string {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(ms - back * DAY_MS).toISOString().slice(0, 10);
}

/** `day` plus `n` days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function isDayInRange(day: string, filter: Pick<MetricsFilter, "from" | "to">): boolean {
  if (filter.from !== undefined && day < filter.from) return false;
  if (filter.to !== undefined && day > filter.to) return false;
  return true;
}

function inScope(
  facilityId: FacilityId,
  districtId: DistrictId | undefined,
  filter: MetricsFilter,
): boolean {
  if (filter.facilityIds !== undefined && !filter.facilityIds.includes(facilityId)) return false;
  if (filter.districtIds !== undefined) {
    if (districtId === undefined || !filter.districtIds.includes(districtId)) return false;
  }
  return true;
}

/**
 * Applies the filter:
 * - screenings: scope (facility AND district) and Kigali day of `measuredAt` within the range;
 * - reviews → of cohort screenings; referrals → of cohort reviews; follow-ups → of cohort reviews
 *   or referrals (an unlinked follow-up is attributed by its facility and the Kigali day of
 *   `dueAt`);
 * - patients, facilities, districts: scope only (no date).
 * Empty results are valid (calculators return zeros). Never mutates `data`.
 */
export function applyMetricsFilter(data: AnalyticsInput, filter: MetricsFilter): AnalyticsInput {
  const facilityDistrict = new Map(data.facilities.map((f) => [f.id, f.districtId]));
  const facilities = data.facilities.filter((f) => inScope(f.id, f.districtId, filter));
  const districtIds = new Set(facilities.map((f) => f.districtId));
  const districts = data.districts.filter(
    (d) =>
      (filter.districtIds === undefined || filter.districtIds.includes(d.id)) &&
      (filter.facilityIds === undefined || districtIds.has(d.id)),
  );

  const screenings = data.screenings.filter(
    (s) =>
      inScope(s.facilityId, s.districtId, filter) && isDayInRange(kigaliDate(s.measuredAt), filter),
  );
  const screeningIds = new Set<ScreeningId>(screenings.map((s) => s.id));
  const reviews = data.reviews.filter((r) => screeningIds.has(r.screeningId));
  const reviewIds = new Set<ReviewId>(reviews.map((r) => r.id));
  const referrals = data.referrals.filter((r) => reviewIds.has(r.reviewId));
  const referralIds = new Set<ReferralId>(referrals.map((r) => r.id));
  const followUps = data.followUps.filter((f) => {
    if (f.reviewId !== null || f.referralId !== null) {
      return (
        (f.reviewId !== null && reviewIds.has(f.reviewId)) ||
        (f.referralId !== null && referralIds.has(f.referralId))
      );
    }
    return (
      inScope(f.facilityId, facilityDistrict.get(f.facilityId), filter) &&
      isDayInRange(kigaliDate(f.dueAt), filter)
    );
  });
  const patients = data.patients.filter((p) => inScope(p.facilityId, p.districtId, filter));

  return {
    patients,
    screenings,
    reviews,
    referrals,
    followUps,
    facilities,
    districts,
  };
}
