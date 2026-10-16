/**
 * Africa/Kigali wall time ⇄ UTC ISO (Kigali is UTC+02:00, no DST). Same contract as the
 * ui-web `DateTimeInput` helpers; the native `DateTimeField` edits date and time separately.
 */
import { KIGALI_UTC_OFFSET_MS } from "@laif/i18n";

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** UTC ISO → Kigali wall time `YYYY-MM-DDTHH:mm` (`""` when empty/invalid). */
export function utcIsoToKigaliWallTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const wall = new Date(ms + KIGALI_UTC_OFFSET_MS);
  return `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/** Kigali wall time `YYYY-MM-DDTHH:mm` → UTC ISO (`…Z`); invalid → null. */
export function kigaliWallTimeToUtcIso(wall: string): string | null {
  const match = WALL_TIME.exec(wall);
  if (match === null) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) - KIGALI_UTC_OFFSET_MS;
  const check = new Date(ms + KIGALI_UTC_OFFSET_MS);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(ms).toISOString();
}
