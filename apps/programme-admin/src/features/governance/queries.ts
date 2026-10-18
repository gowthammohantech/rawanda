/**
 * Governance queries (ADM-08 task 8):
 * - `useRulesetHistory` — `adminKeys.rulesets(scopeKey, threshold)`: `listRulesets()` + the
 *   in-scope cohort screenings per `rulesetVersion` over the whole ruleset history window
 *   (aggregate; primary small-cell suppression; flagged share suppressed with its basis);
 * - `useAuditPage` — `adminKeys.audit(scopeKey, filters, page)`: one 25-row page, newest first;
 * - `useAuditTotal` — the unfiltered total (tab count);
 * - `useAccessReport` — `adminKeys.accessReport(scopeKey, window)`: counts by action (the page
 *   `total` of a one-row read per action) and the "denied access by requested district" list;
 * - `useGrants` / `useGrantHistory` — `adminKeys.grants()` and the grant's version history from
 *   its `admin.access_grant.*` audit events (older versions are kept, T-06).
 * Every read goes through the repository (scope and audit visibility enforced there).
 */
import {
  addDays,
  kigaliDate,
  suppressRate,
  suppressValue,
  type AggregateCell,
} from "@laif/analytics";
import type { RulesetHistoryEntry } from "@laif/contracts";
import type { AuditEvent, Role } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";
import { useQuery } from "@tanstack/react-query";

import { useRepository, useServices } from "../../app/providers.tsx";
import { adminKeys, type AuditFilterKey } from "../../lib/queryKeys.ts";
import { DEFAULT_FILTERS } from "../filters/filterSchema.ts";
import { loadMetricsDataset, type ScopeAccess } from "../metrics/loadMetricsDataset.ts";
import { useAccess, useSuppressionThreshold } from "../metrics/queries.ts";

export const AUDIT_PAGE_SIZE = 25;
/** Access report window (days, ending on the demo today). */
export const ACCESS_REPORT_DAYS = 90;

export type RulesetRow = RulesetHistoryEntry & {
  screeningsEvaluated: AggregateCell;
  flaggedShare: AggregateCell;
};

export async function loadRulesetHistory(
  repo: Pick<CareRepository, "listRulesets" | "getMetricsRecords">,
  access: ScopeAccess,
  nowIso: string,
  threshold: number,
): Promise<RulesetRow[]> {
  const rulesets = await repo.listRulesets();
  const earliest = rulesets.reduce<string | null>(
    (min, r) => (min === null || r.effectiveFrom < min ? r.effectiveFrom : min),
    null,
  );
  const today = kigaliDate(nowIso);
  const { dataset } = await loadMetricsDataset(
    repo,
    access,
    { ...DEFAULT_FILTERS, preset: "custom" },
    { from: earliest === null ? today : kigaliDate(earliest), to: today },
  );
  return rulesets.map((r) => {
    const evaluated = dataset.cohort.screenings.filter((s) => s.rulesetVersion === r.version);
    const flagged = evaluated.filter((s) => s.status === "review_required").length;
    const count = suppressValue(evaluated.length, threshold);
    const share = suppressRate(suppressValue(flagged, threshold), count);
    return {
      ...r,
      screeningsEvaluated: { key: r.version, ...count },
      flaggedShare: { key: r.version, ...share },
    };
  });
}

export function useRulesetHistory() {
  const repo = useRepository();
  const { clock } = useServices();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.rulesets(scopeKey, threshold),
    queryFn: () => {
      if (access === null) throw new Error("no admin session");
      return loadRulesetHistory(repo, access, clock.nowIso(), threshold);
    },
    enabled: access !== null,
    retry: false,
  });
}

/** Kigali day → UTC ISO bounds of the audit filter (`from` start of day, `to` end of day). */
export function dayBounds(filters: AuditFilterKey): { from?: string; to?: string } {
  const KIGALI_OFFSET = "+02:00";
  return {
    ...(filters.from === null
      ? {}
      : { from: new Date(`${filters.from}T00:00:00.000${KIGALI_OFFSET}`).toISOString() }),
    ...(filters.to === null
      ? {}
      : { to: new Date(`${filters.to}T23:59:59.999${KIGALI_OFFSET}`).toISOString() }),
  };
}

export function auditRequest(filters: AuditFilterKey, page: number) {
  return {
    page,
    pageSize: AUDIT_PAGE_SIZE,
    ...(filters.action === null ? {} : { action: filters.action }),
    ...(filters.role === null ? {} : { actorRole: filters.role as Role }),
    ...(filters.entity === null ? {} : { entityType: filters.entity as AuditEvent["entityType"] }),
    ...(filters.correlationId === null ? {} : { correlationId: filters.correlationId }),
    ...dayBounds(filters),
  };
}

export function useAuditPage(filters: AuditFilterKey, page: number, enabled = true) {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.audit(scopeKey, filters, page),
    queryFn: () => repo.listAuditEvents(auditRequest(filters, page)),
    enabled: enabled && access !== null,
    retry: false,
    staleTime: 0,
  });
}

export const NO_AUDIT_FILTERS: AuditFilterKey = {
  action: null,
  role: null,
  entity: null,
  from: null,
  to: null,
  correlationId: null,
};

/** Unfiltered total for the tab count (page size 1). */
export function useAuditTotal() {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: [...adminKeys.auditAll(scopeKey), "total"] as const,
    queryFn: async () => (await repo.listAuditEvents({ pageSize: 1 })).total,
    enabled: access !== null,
    retry: false,
    staleTime: 0,
  });
}

/** Counted actions of the access report (in this order). */
export const ACCESS_REPORT_ACTIONS = [
  "session.started",
  "access.denied",
  "admin.drilldown.viewed",
  "export.generated",
  "export.denied",
  "admin.access_grant.",
] as const;
export type AccessReportAction = (typeof ACCESS_REPORT_ACTIONS)[number];

export type AccessReport = {
  window: { from: string; to: string };
  counts: Record<AccessReportAction, number>;
  /** Denied access by requested district (district id or `unknown`), largest first. */
  deniedByDistrict: Array<{ key: string; value: number }>;
};

export async function loadAccessReport(
  repo: Pick<CareRepository, "listAuditEvents">,
  window: { from: string; to: string },
): Promise<AccessReport> {
  const bounds = dayBounds({ ...NO_AUDIT_FILTERS, from: window.from, to: window.to });
  const counts = {} as Record<AccessReportAction, number>;
  for (const action of ACCESS_REPORT_ACTIONS) {
    counts[action] = (await repo.listAuditEvents({ action, pageSize: 1, ...bounds })).total;
  }
  const denied: AuditEvent[] = [];
  for (let page = 1; ; page += 1) {
    const result = await repo.listAuditEvents({
      action: "access.denied",
      page,
      pageSize: 200,
      ...bounds,
    });
    denied.push(...result.items);
    if (page * result.pageSize >= result.total) break;
  }
  const byDistrict = new Map<string, number>();
  for (const event of denied) {
    const requested = (event.changeSummary as { requested?: { district?: unknown } } | undefined)
      ?.requested?.district;
    const key =
      typeof requested === "string" && requested !== ""
        ? requested
        : (event.districtId ?? "unknown");
    byDistrict.set(key, (byDistrict.get(key) ?? 0) + 1);
  }
  return {
    window,
    counts,
    deniedByDistrict: [...byDistrict.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : 1)),
  };
}

export function useAccessReport() {
  const repo = useRepository();
  const { clock } = useServices();
  const { access, scopeKey } = useAccess();
  const to = kigaliDate(clock.nowIso());
  const window = { from: addDays(to, -(ACCESS_REPORT_DAYS - 1)), to };
  return useQuery({
    queryKey: adminKeys.accessReport(scopeKey, window),
    queryFn: () => loadAccessReport(repo, window),
    enabled: access !== null,
    retry: false,
    staleTime: 0,
  });
}

export function useGrants() {
  const repo = useRepository();
  return useQuery({
    queryKey: adminKeys.grants(),
    queryFn: () => repo.listAccessGrants(),
    retry: false,
  });
}

export type GrantVersion = {
  eventId: string;
  at: string;
  actorId: string | null;
  action: string;
  fromVersion: number | null;
  toVersion: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  justification: string | null;
};

export function useGrantHistory(grantId: string, enabled: boolean) {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.grantHistory(scopeKey, grantId),
    queryFn: async (): Promise<GrantVersion[]> => {
      const page = await repo.listAuditEvents({
        action: "admin.access_grant.",
        entityType: "access_grant",
        entityId: grantId,
        pageSize: 200,
      });
      return page.items.map((e) => {
        const summary = (e.changeSummary ?? {}) as Record<string, unknown>;
        const num = (v: unknown) => (typeof v === "number" ? v : null);
        const obj = (v: unknown) =>
          typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
        return {
          eventId: e.id,
          at: e.occurredAt,
          actorId: e.actorId,
          action: e.action,
          fromVersion: num(summary["fromVersion"]),
          toVersion: num(summary["toVersion"]),
          before: obj(summary["before"]),
          after: obj(summary["after"]),
          justification: e.justification ?? null,
        };
      });
    },
    enabled: enabled && access !== null,
    retry: false,
    staleTime: 0,
  });
}
