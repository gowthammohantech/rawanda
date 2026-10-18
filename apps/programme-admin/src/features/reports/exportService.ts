/**
 * `requestExport()` (ADM-07 task 7) — every aggregate export goes through here:
 *
 * 1. Validate the request (reason, acknowledgement) and record `export.requested` (once per key).
 * 2. `assertCapability('export.aggregate')` — missing → the repository records the denial
 *    (`export.denied` + a `denied` ExportAudit row) and the call fails with FORBIDDEN.
 * 3. `assertScope(grant, filters)` — outside the grant (tampered client state, URL check
 *    bypassed) → the same denial path with the requested ids; FORBIDDEN, no file.
 * 4. Idempotency: a key already used for a `generated` export returns that ExportAudit and
 *    re-downloads the SAME stored bytes (no new audit). Concurrent calls with one key share
 *    one promise (double click).
 * 5. Load the scope-wide dataset, build the rows from the page selectors, `assertAggregateOnly`,
 *    build the CSV (BOM + watermark + metadata + trailer).
 * 6. Persist through `recordExport(input, key)` (ExportAudit `generated` + `export.generated`).
 * 7. Download (Blob + temporary anchor).
 *
 * Everything runs on the device (demo), so an export also works offline.
 */
import { checkAccess } from "@laif/auth-demo";
import {
  contractsErrorMap,
  ExportRequestSchema,
  issuesToFieldErrors,
  type ExportAudit,
  type ExportReason,
} from "@laif/contracts";
import { isRepositoryError, RepositoryError, type CareRepository } from "@laif/repositories";
import type { QueryClient } from "@tanstack/react-query";

import type { Tx } from "../../app/persona-labels.ts";
import type { AdminSessionStore } from "../../auth/sessionStore.ts";
import { assertScope } from "../../auth/scope.ts";
import { emitAdminAudit } from "../../lib/audit.ts";
import { adminKeys, scopeKeyOf } from "../../lib/queryKeys.ts";
import type { AdminFilters, Period } from "../filters/filterSchema.ts";
import { buildExportCsv, downloadCsv, type ExportCsv } from "./exportCsv.ts";
import { loadReportSections } from "./queries.ts";
import type { ReportTemplateId } from "./templates.ts";
import type { ReportGranularity } from "@laif/analytics";

export type ExportDeps = {
  repo: CareRepository;
  session: AdminSessionStore;
  client: QueryClient;
  threshold: number;
  /** Demo-clock instant (ISO UTC) for the workload baseline window. */
  nowIso: string;
  t: Tx;
  /** Test seam (default: browser download). */
  download?: (text: string, fileName: string) => void;
  /** Seeded patient display names the guard must never let through (tests inject them). */
  forbiddenValues?: readonly string[];
};

export type ExportRequestInput = {
  template: ReportTemplateId;
  granularity: ReportGranularity;
  filters: AdminFilters;
  period: Period;
  reason: ExportReason;
  /** Created when the export step mounts; reused by every retry. */
  idempotencyKey: string;
  /** Created with the key: the `export_id` written in the file. */
  exportId: string;
  /** First submit instant of this attempt (kept for retries so the bytes are identical). */
  generatedAt: Date;
};

export type ExportResult = {
  audit: ExportAudit;
  fileName: string;
  /** True when the key had already produced a file (same bytes re-downloaded). */
  replayed: boolean;
};

const inFlight = new Map<string, Promise<ExportResult>>();

function forbidden(details: Record<string, string>): RepositoryError {
  return new RepositoryError("FORBIDDEN", { reason: "ROLE", details });
}

async function findGenerated(repo: CareRepository, key: string): Promise<ExportAudit | null> {
  const rows = await repo.listExportAudits({ idempotencyKey: key, statuses: ["generated"] });
  return rows[0] ?? null;
}

export function requestExport(deps: ExportDeps, input: ExportRequestInput): Promise<ExportResult> {
  const running = inFlight.get(input.idempotencyKey);
  if (running !== undefined) return running;
  const promise = run(deps, input).finally(() => inFlight.delete(input.idempotencyKey));
  inFlight.set(input.idempotencyKey, promise);
  return promise;
}

async function run(deps: ExportDeps, input: ExportRequestInput): Promise<ExportResult> {
  const { repo, session, client, t } = deps;
  const download = deps.download ?? downloadCsv;
  const state = session.getState();
  const actor = session.actor();
  if (state.session === null || state.persona === null || actor === null) {
    throw forbidden({ unauthenticated: "true" });
  }
  const persona = state.persona;
  const grant = state.grant;
  const adminSession = state.session;

  const parsed = ExportRequestSchema.safeParse(
    {
      idempotencyKey: input.idempotencyKey,
      template: input.template,
      granularity: input.granularity,
      reason: input.reason,
    },
    { error: contractsErrorMap },
  );
  if (!parsed.success) {
    throw new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    });
  }
  const reason = parsed.data.reason;
  const reasonText = reason.reasonText === "" ? undefined : reason.reasonText;
  const requested = {
    districtIds: input.filters.district === null ? [] : [input.filters.district],
    facilityIds: input.filters.facility === null ? [] : [input.filters.facility],
  };

  if (session.once.claim(`export.requested:${input.idempotencyKey}`)) {
    await emitAdminAudit(repo, adminSession, {
      action: "export.requested",
      entityType: "export_audit",
      entityId: input.exportId,
      changeSummary: {
        idempotencyKey: input.idempotencyKey,
        template: input.template,
        granularity: input.granularity,
        reasonCode: reason.reasonCode,
        requested,
        period: input.period,
      },
      justification: reasonText ?? reason.reasonCode,
    });
  }

  const filtersJson = {
    ...input.filters,
    periodFrom: input.period.from,
    periodTo: input.period.to,
  };
  const deniedRecord = (scope: { districtIds: string[]; facilityIds: string[] }) =>
    repo.recordExport(
      {
        reasonCode: reason.reasonCode,
        ...(reasonText === undefined ? {} : { reasonText }),
        template: input.template,
        granularity: input.granularity,
        scope,
        filters: filtersJson,
        period: input.period,
        rowCount: 0,
        suppressedCells: 0,
        sha256: "0".repeat(64),
        grantId: adminSession.grantId,
        correlationId: adminSession.correlationId,
      },
      input.idempotencyKey,
    );

  // 2. Capability: the repository records the denial (export.denied + denied ExportAudit).
  if (!checkAccess(actor, "export.aggregate").allowed) {
    await deniedRecord(requested);
    throw forbidden({ permission: "export.aggregate" });
  }
  // 3. Scope (defence in depth against a tampered client state).
  try {
    assertScope(persona, grant, {
      districtIds: requested.districtIds,
      facilityIds: requested.facilityIds,
    });
  } catch (error) {
    if (isRepositoryError(error) && error.code === "FORBIDDEN") {
      await deniedRecord(requested);
    }
    throw error;
  }

  // 4. Idempotent replay: same key → same stored bytes, no new audit.
  const existing = await findGenerated(repo, input.idempotencyKey);
  if (existing !== null && existing.csvText !== null && existing.fileName !== null) {
    download(existing.csvText, existing.fileName);
    return { audit: existing, fileName: existing.fileName, replayed: true };
  }

  // 5. Build from the page selectors (single suppression pass).
  const scopeKey = scopeKeyOf(grant);
  const data = await loadReportSections({
    client,
    repo,
    access: { persona, grant },
    scopeKey,
    api: { filters: input.filters, period: input.period },
    threshold: deps.threshold,
    template: input.template,
    granularity: input.granularity,
    nowIso: deps.nowIso,
  });
  const view = { district: input.filters.district, facility: input.filters.facility };
  const csv: ExportCsv = buildExportCsv(data, view, t, {
    exportId: input.exportId,
    generatedAt: input.generatedAt,
    personaId: persona.id,
    role: persona.role,
    reasonCode: reason.reasonCode,
    ...(deps.forbiddenValues === undefined ? {} : { forbiddenValues: deps.forbiddenValues }),
  });

  // 6. Persist (ExportAudit generated + export.generated), idempotent on the key.
  const result = await repo.recordExport(
    {
      reasonCode: reason.reasonCode,
      ...(reasonText === undefined ? {} : { reasonText }),
      template: input.template,
      granularity: input.granularity,
      scope: { districtIds: data.districtIds, facilityIds: data.facilityIds },
      filters: filtersJson,
      period: input.period,
      rowCount: csv.rowCount,
      suppressedCells: csv.suppressedCells,
      sha256: csv.sha256,
      exportId: input.exportId,
      fileName: csv.fileName,
      csvText: csv.text,
      grantId: adminSession.grantId,
      correlationId: adminSession.correlationId,
    },
    input.idempotencyKey,
  );
  const audit = await findGenerated(repo, input.idempotencyKey);
  if (audit === null || audit.csvText === null || audit.fileName === null) {
    throw new RepositoryError("INTERNAL", { details: { exportId: input.exportId } });
  }
  void client.invalidateQueries({ queryKey: adminKeys.exports(scopeKey) });

  // 7. Download the stored bytes (identical to a later replay).
  download(audit.csvText, audit.fileName);
  return { audit, fileName: audit.fileName, replayed: result.replayed };
}
