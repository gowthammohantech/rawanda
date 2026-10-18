/**
 * Audit explorer model (CLN-10): URL ⇄ `AuditExplorerFilterSchema` state, action families and
 * quick chips mapped onto the FND-07 audit action REGISTRY (exact names, so a family never
 * silently misses an action), the repository filter (`AuditFilterSchema`, Kigali days → UTC) and
 * the before → after view of a `changeSummary`.
 *
 * Scope is NOT decided here: the repository limits every list to the actor's facility.
 */
import {
  AUDIT_EXPLORER_PAGE_SIZE,
  AuditExplorerFilterSchema,
  type AuditActionFamily,
  type AuditExplorerFilter,
  type AuditQuickFilter,
} from "@laif/contracts";
import type { AuditEvent, JsonValue } from "@laif/domain";
import { kigaliDayEndUtc, kigaliDayStartUtc } from "@laif/i18n";
import {
  AUDIT_ACTION_NAMES,
  auditActionSpec,
  type AuditAction,
  type AuditFilterInput,
} from "@laif/repositories";

export { AUDIT_EXPLORER_PAGE_SIZE };

/** Family of a registered action (`followup` also holds care tasks / correction requests). */
export function familyOf(action: string): Exclude<AuditActionFamily, "all"> | null {
  const head = action.split(".")[0] ?? "";
  if (head === "session" || head === "device") return "auth";
  if (head === "audit" || head === "export") return "audit";
  if (head === "conflict" || action === "sync.conflict_resolved") return "conflict";
  if (head === "demo") return "demo";
  if (head === "patient")
    return action === "patient.viewed" || action === "patient.searched" ? "access" : "patient";
  if (head === "access" || action.endsWith(".viewed") || action.endsWith("_viewed")) {
    return "access";
  }
  if (head === "screening") return "screening";
  if (head === "review" || head === "queue") return "review";
  if (head === "referral" || action.startsWith("clinical.referral.")) return "referral";
  if (head === "followup" || head === "task" || head === "correction") return "followup";
  return null;
}

const registered = (pick: (action: AuditAction) => boolean): AuditAction[] =>
  AUDIT_ACTION_NAMES.filter(pick);

/** Registered action names of a family (`null` = all, no action restriction). */
export function familyActions(family: AuditActionFamily): AuditAction[] | null {
  if (family === "all") return null;
  return registered((a) => familyOf(a) === family);
}

type ChipSpec = { actions?: readonly AuditAction[]; outcome?: "success" | "denied" };

/** Quick chips (task 3 / WF-04): exact action lists + outcome. */
export const CHIP_SPECS: Readonly<Record<AuditQuickFilter, ChipSpec>> = {
  decisions: { actions: ["review.decided", "review.dismissed"] },
  dismissals: { actions: ["review.dismissed"] },
  referrals: { actions: registered((a) => familyOf(a) === "referral") },
  tasks: { actions: registered((a) => familyOf(a) === "followup") },
  sensitiveReads: {
    actions: registered(
      (a) =>
        auditActionSpec(a).category === "access" &&
        familyOf(a) === "access" &&
        a !== "access.denied",
    ),
    outcome: "success",
  },
  deniedAccess: { outcome: "denied" },
  conflicts: { actions: registered((a) => familyOf(a) === "conflict") },
  demoControls: { actions: registered((a) => auditActionSpec(a).category === "demo") },
};

export const DEFAULT_AUDIT_FILTER: AuditExplorerFilter = AuditExplorerFilterSchema.parse({});

/** URL keys = schema keys. */
const URL_KEYS = [
  "actionFamily",
  "chip",
  "actorId",
  "role",
  "entityType",
  "entityId",
  "patient",
  "correlationId",
  "from",
  "to",
  "page",
] as const satisfies readonly (keyof AuditExplorerFilter)[];

export type AuditParams = {
  filter: AuditExplorerFilter;
  /** The URL held an invalid filter (e.g. from > to): the page shows the default list + error. */
  invalid: boolean;
  /** `?event=` opens the drawer. */
  eventId: string | null;
};

export function parseAuditParams(params: URLSearchParams): AuditParams {
  const raw: Record<string, string> = {};
  for (const key of URL_KEYS) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const parsed = AuditExplorerFilterSchema.safeParse(raw);
  const event = params.get("event");
  return {
    filter: parsed.success ? parsed.data : DEFAULT_AUDIT_FILTER,
    invalid: !parsed.success,
    eventId: event === null || event.trim() === "" ? null : event,
  };
}

/** Writes a filter into the URL (defaults omitted); `event` is kept unless patched. */
export function filterToParams(
  filter: Partial<AuditExplorerFilter>,
  current: URLSearchParams,
  eventId?: string | null,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of URL_KEYS) {
    const value = filter[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "actionFamily" && value === "all") continue;
    if (key === "page" && value === 1) continue;
    out.set(key, String(value));
  }
  const event = eventId === undefined ? current.get("event") : eventId;
  if (event !== null && event !== "") out.set("event", event);
  return out;
}

const intersect = (
  a: readonly string[] | null,
  b: readonly string[] | undefined,
): string[] | null => {
  if (a === null) return b === undefined ? null : [...b];
  if (b === undefined) return [...a];
  return a.filter((x) => b.includes(x));
};

/** Patient lookup for the `patient` filter (synthetic identifier → patient id). */
export type PatientIdLookup = (value: string) => string;

/**
 * Explorer state → repository filter (`AuditFilterSchema`). Kigali days → UTC instants; a family
 * and a chip combine (intersection); an empty intersection still sends `actions: []`-equivalent
 * (an impossible action), so the result is empty rather than unfiltered.
 */
export function toRepositoryFilter(
  filter: AuditExplorerFilter,
  lookupPatient: PatientIdLookup = (v) => v,
): AuditFilterInput {
  const chip = filter.chip === undefined ? undefined : CHIP_SPECS[filter.chip];
  const actions = intersect(familyActions(filter.actionFamily), chip?.actions);
  const out: AuditFilterInput = { page: filter.page, pageSize: AUDIT_EXPLORER_PAGE_SIZE };
  if (actions !== null) out.actions = actions.length === 0 ? ["none.none"] : actions;
  if (chip?.outcome !== undefined) out.outcome = chip.outcome;
  if (filter.actorId !== undefined) out.actorId = filter.actorId;
  if (filter.role !== undefined) out.actorRole = filter.role;
  if (filter.entityType !== undefined) out.entityType = filter.entityType;
  if (filter.entityId !== undefined) out.entityId = filter.entityId;
  if (filter.patient !== undefined) out.patientId = lookupPatient(filter.patient);
  if (filter.correlationId !== undefined) out.correlationId = filter.correlationId;
  if (filter.from !== undefined) out.from = kigaliDayStartUtc(filter.from);
  if (filter.to !== undefined) out.to = kigaliDayEndUtc(filter.to);
  return out;
}

/** "key=value; key=value" of the filters in use (export metadata, toast, audit summary). */
export function filterSummary(filter: AuditExplorerFilter): string {
  const parts: string[] = [];
  for (const key of URL_KEYS) {
    if (key === "page") continue;
    const value = filter[key];
    if (value === undefined || (key === "actionFamily" && value === "all")) continue;
    parts.push(`${key}=${String(value)}`);
  }
  return parts.length === 0 ? "none" : parts.join("; ");
}

/** `{ key: value }` of the filters in use (JSON-safe, for audit change summaries). */
export function filterRecord(filter: AuditExplorerFilter): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const key of URL_KEYS) {
    if (key === "page") continue;
    const value = filter[key];
    if (value === undefined || (key === "actionFamily" && value === "all")) continue;
    out[key] = value;
  }
  return out;
}

export const shortId = (id: string): string => (id.length <= 8 ? id : id.slice(0, 8));

// ── changeSummary → before / after rows ─────────────────────────────────────

export type ChangeRow = { key: string; before: string | null; after: string };

const isRecord = (v: JsonValue | undefined): v is { [key: string]: JsonValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function stringifyValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => stringifyValue(v)).join(", ");
  if (!isRecord(value)) return "—";
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${stringifyValue(v)}`)
    .join("; ");
}

/**
 * Two-column view of a change summary: top-level `from` / `to` become one "status" row
 * (before → after); nested `{ from, to }` / `{ before, after }` values become a row each; every
 * other key is an "after" value with no "before".
 */
/** The change summary as an object (`{}` for any other JSON value). */
export function summaryRecord(summary: AuditEvent["changeSummary"]): {
  [key: string]: JsonValue;
} {
  return isRecord(summary) ? summary : {};
}

export function changeRows(value: AuditEvent["changeSummary"]): ChangeRow[] {
  const summary = summaryRecord(value);
  const rows: ChangeRow[] = [];
  const hasFrom = "from" in summary;
  const hasTo = "to" in summary;
  if (hasFrom || hasTo) {
    rows.push({
      key: "status",
      before: hasFrom ? stringifyValue(summary["from"]) : null,
      after: hasTo ? stringifyValue(summary["to"]) : "—",
    });
  }
  for (const [key, value] of Object.entries(summary)) {
    if (key === "from" || key === "to") continue;
    if (isRecord(value) && ("from" in value || "before" in value)) {
      rows.push({
        key,
        before: stringifyValue(value["from"] ?? value["before"]),
        after: stringifyValue(value["to"] ?? value["after"]),
      });
      continue;
    }
    rows.push({ key, before: null, after: stringifyValue(value) });
  }
  return rows;
}

/**
 * Justification text the drawer may show (task 4): never for `access.*` category events (a
 * sensitive read never re-displays clinical free text); shown for change events — in particular
 * `review.dismissed`, whose rationale is needed for accountability.
 */
export function visibleJustification(event: AuditEvent): string | null {
  if (event.category === "access") return null;
  return event.justification;
}
