/**
 * Audit-explorer filters (ADM-08 task 3), stored in the URL so a filtered view (e.g. one
 * correlation chain) can be shared: `aaction` (an action or an action-group prefix ending in
 * `.`), `arole`, `aentity`, `afrom` / `ato` (Kigali `YYYY-MM-DD`, from ≤ to), `acorr`
 * (correlation id) and `apage` (1-based). Each param is validated with Zod; an invalid value is
 * ignored and reported with a translated message key (`admin:governance.audit.filter.error.*`).
 */
import { ENTITY_TYPES, ROLES } from "@laif/domain";
import type { TranslationKey } from "@laif/ui-web";
import { z } from "zod";

import type { AuditFilterKey } from "../../lib/queryKeys.ts";

export const AUDIT_FILTER_PARAMS = {
  action: "aaction",
  role: "arole",
  entity: "aentity",
  from: "afrom",
  to: "ato",
  correlationId: "acorr",
  page: "apage",
} as const;

/** Action filter choices: groups (prefix `….`) and the most-asked single actions. */
export const AUDIT_ACTION_FILTERS = [
  "access.denied",
  "session.",
  "export.",
  "admin.access_grant.",
  "admin.access_simulation.run",
  "admin.audit.viewed",
  "audit.viewed",
  "admin.drilldown.viewed",
  "admin.programme_action.",
  "admin.quality_issue.",
  "conflict.",
  "screening.",
  "review.",
  "referral.",
  "followup.",
  "demo.",
] as const;

/** Roles shown in the actor-role filter (every FND role). */
export const AUDIT_ROLE_FILTERS = ROLES;
export const AUDIT_ENTITY_FILTERS = ENTITY_TYPES;

const IsoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const ms = Date.parse(`${v}T00:00:00.000Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
  });

export const AuditFilterUrlSchema = z.object({
  action: z.enum(AUDIT_ACTION_FILTERS),
  role: z.enum(AUDIT_ROLE_FILTERS),
  entity: z.enum(AUDIT_ENTITY_FILTERS),
  from: IsoDay,
  to: IsoDay,
  correlationId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/),
  page: z.coerce.number().int().min(1).max(10_000),
});

export type AuditFilterField = Exclude<keyof typeof AUDIT_FILTER_PARAMS, "page">;

export type AuditFilterIssue = { field: AuditFilterField | "page"; messageKey: TranslationKey };

export type ParsedAuditFilters = {
  filters: AuditFilterKey;
  page: number;
  issues: AuditFilterIssue[];
};

const MESSAGE: Record<AuditFilterField | "page", TranslationKey> = {
  action: "admin:governance.audit.filter.error.action",
  role: "admin:governance.audit.filter.error.role",
  entity: "admin:governance.audit.filter.error.entity",
  from: "admin:governance.audit.filter.error.date",
  to: "admin:governance.audit.filter.error.date",
  correlationId: "admin:governance.audit.filter.error.correlation",
  page: "admin:governance.audit.filter.error.page",
};

export function parseAuditFilters(search: string | URLSearchParams): ParsedAuditFilters {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const issues: AuditFilterIssue[] = [];
  const shape = AuditFilterUrlSchema.shape;
  const read = <F extends AuditFilterField>(field: F): string | null => {
    const raw = params.get(AUDIT_FILTER_PARAMS[field])?.trim() ?? "";
    if (raw === "") return null;
    const parsed = shape[field].safeParse(raw);
    if (parsed.success) return String(parsed.data);
    issues.push({ field, messageKey: MESSAGE[field] });
    return null;
  };
  const filters: AuditFilterKey = {
    action: read("action"),
    role: read("role"),
    entity: read("entity"),
    from: read("from"),
    to: read("to"),
    correlationId: read("correlationId"),
  };
  if (filters.from !== null && filters.to !== null && filters.from > filters.to) {
    issues.push({ field: "to", messageKey: "admin:governance.audit.filter.error.dateOrder" });
    filters.to = null;
  }
  let page = 1;
  const rawPage = params.get(AUDIT_FILTER_PARAMS.page);
  if (rawPage !== null && rawPage !== "") {
    const parsed = shape.page.safeParse(rawPage);
    if (parsed.success) page = parsed.data;
    else issues.push({ field: "page", messageKey: MESSAGE.page });
  }
  return { filters, page, issues };
}

/** Writes the filters (and page) into `params`, removing empty ones; other params are kept. */
export function writeAuditFilters(
  params: URLSearchParams,
  filters: AuditFilterKey,
  page = 1,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const field of Object.keys(filters) as AuditFilterField[]) {
    const value = filters[field];
    if (value === null || value === "") next.delete(AUDIT_FILTER_PARAMS[field]);
    else next.set(AUDIT_FILTER_PARAMS[field], value);
  }
  if (page > 1) next.set(AUDIT_FILTER_PARAMS.page, String(page));
  else next.delete(AUDIT_FILTER_PARAMS.page);
  return next;
}

/** Stable key of the filters (for the once-per-session `admin.audit.viewed`). */
export function auditFilterKeyString(filters: AuditFilterKey): string {
  return JSON.stringify([
    filters.action,
    filters.role,
    filters.entity,
    filters.from,
    filters.to,
    filters.correlationId,
  ]);
}
