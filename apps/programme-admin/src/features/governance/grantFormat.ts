/**
 * Display helpers for AccessGrant changes (audit explorer, grant history, conflict notice):
 * scope lists as district / facility names and before → after lines of the edited fields.
 */
import { roleLabelKey } from "@laif/auth-demo";
import type { Role } from "@laif/domain";

import { districtLabel, facilityLabel, type Tx } from "../../app/persona-labels.ts";

type Json = Record<string, unknown>;

export function scopeText(value: unknown, t: Tx): string {
  if (value === "ALL_IN_DISTRICTS") return t("admin:governance.grant.allFacilities");
  if (!Array.isArray(value)) return "—";
  return (
    value
      .map((id) =>
        typeof id !== "string"
          ? ""
          : id.startsWith("dist-")
            ? districtLabel(id, t)
            : facilityLabel(id, t),
      )
      .join(", ") || "—"
  );
}

/** Before → after lines of a grant change (role, districts, facilities, valid until). */
export function grantChangeLines(
  before: Json | null,
  after: Json | null,
  t: Tx,
  date: (iso: string) => string,
): Array<{ field: string; from: string; to: string }> {
  if (before === null || after === null) return [];
  const value = (field: string, v: unknown): string => {
    if (field === "role") return typeof v === "string" ? t(roleLabelKey(v as Role)) : "—";
    if (field === "validTo") {
      return typeof v === "string" ? date(v) : t("admin:governance.grant.openEnded");
    }
    return scopeText(v, t);
  };
  return ["role", "districtIds", "facilityIds", "validTo"]
    .map((field) => ({
      field,
      from: value(field, before[field]),
      to: value(field, after[field]),
    }))
    .filter((line) => line.from !== line.to);
}
