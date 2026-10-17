/**
 * Synthetic facility contact cards (CTZ-04 next steps). DEMO ONLY: the numbers use the
 * unallocated `+250 700 000 xxx` range and are never dialled — the wallet shows a "demo number"
 * sheet instead of calling. Addresses are fictional; opening hours are Kigali wall-clock times.
 */
import type { FacilityId } from "@laif/domain";

import { FACILITY_IDS } from "./facilities.ts";

export type FacilityOpeningDays = "mon_fri" | "mon_sat" | "every_day";

export type FacilityContact = {
  facilityId: FacilityId;
  /** E.164, synthetic — never connects. */
  phone: string;
  /** Grouped for display / screen readers. */
  phoneDisplay: string;
  hours: { days: FacilityOpeningDays; opens: string; closes: string };
  /** Fictional street address (plain text, no map link). */
  address: string;
  synthetic: true;
};

export const FACILITY_CONTACTS: readonly FacilityContact[] = [
  {
    facilityId: FACILITY_IDS.alpha1,
    phone: "+250700000001",
    phoneDisplay: "+250 700 000 001",
    hours: { days: "mon_fri", opens: "07:00", closes: "17:00" },
    address: "Plot 1, Demo Road, Alpha District (synthetic)",
    synthetic: true,
  },
  {
    facilityId: FACILITY_IDS.alpha2,
    phone: "+250700000002",
    phoneDisplay: "+250 700 000 002",
    hours: { days: "mon_sat", opens: "07:30", closes: "16:30" },
    address: "Plot 2, Demo Hill, Alpha District (synthetic)",
    synthetic: true,
  },
  {
    facilityId: FACILITY_IDS.beta1,
    phone: "+250700000003",
    phoneDisplay: "+250 700 000 003",
    hours: { days: "every_day", opens: "00:00", closes: "23:59" },
    address: "Plot 3, Demo Avenue, Beta District (synthetic)",
    synthetic: true,
  },
];

/** The synthetic contact card of a facility (null when the facility has none). */
export function facilityContactOf(facilityId: string): FacilityContact | null {
  return FACILITY_CONTACTS.find((c) => c.facilityId === facilityId) ?? null;
}
