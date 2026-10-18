/**
 * Audit-log CSV (CLN-10 task 7, T-08), built on the device with the FND-06 low-level helpers
 * (`escapeCsvCell` / `toCsvRows`: RFC 4180 quoting + CSV-injection guard; `CSV_WATERMARK` lines).
 *
 * Layout: UTF-8 BOM, then comment lines — each one in English AND Kinyarwanda so the file reads
 * the same whatever the UI language (needs PO confirmation) — watermark, "Synthetic demonstration
 * data", scope, exported-by (persona, role, Kigali time), filters, tamper-evidence notice and
 * `# export_id=…`; then the header and one row per event, CRLF line endings.
 *
 * Columns are ids and codes only: NO patient names and NO free text (justification / change
 * summary are never exported). `assertNoForbiddenValues` re-checks the finished text against the
 * patient display names the app knows, so a regression fails closed (no file).
 */
import {
  CSV_BOM,
  CSV_SYNTHETIC_LINE,
  CSV_WATERMARK,
  CSV_WATERMARK_RW,
  escapeCsvCell,
  kigaliDate,
  sha256Hex,
  toCsvRows,
} from "@laif/analytics";
import { roleLabelKey } from "@laif/auth-demo";
import type { AuditEvent, FacilityId, Role } from "@laif/domain";
import { formatDateTime, type Language } from "@laif/i18n";
import type { AuditFilterInput, CareRepository } from "@laif/repositories";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";

export const AUDIT_CSV_COLUMNS = [
  "eventId",
  "occurredAtUtc",
  "action",
  "actorId",
  "actorRole",
  "entityType",
  "entityId",
  "patientSyntheticId",
  "facilityId",
  "correlationId",
] as const;

export const AUDIT_EXPORT_TEMPLATE = "audit_log" as const;

/** One translated comment line in both languages (EN first). */
export type BilingualLine = { en: string; rw: string };

export type AuditCsvInput = {
  exportId: string;
  rows: readonly AuditEvent[];
  /** Patient id → synthetic identifier (`DEMO-P-0001`); null when unknown / out of scope. */
  syntheticIdOf: (patientId: string) => string | null;
  /** Already-translated comment lines (without the leading `# `). */
  lines: {
    synthetic: string;
    scope: BilingualLine;
    exportedBy: BilingualLine;
    filters: BilingualLine;
    notice: BilingualLine;
  };
  /** Values that must never appear in the file (patient display names). */
  forbiddenValues?: readonly string[];
};

export type AuditCsv = { text: string; rowCount: number; sha256: string };

export class ForbiddenExportValueError extends Error {
  constructor() {
    super("audit CSV contains a patient display name");
    this.name = "ForbiddenExportValueError";
  }
}

const CRLF = "\r\n";

/** `# text` on one line (CR / LF collapsed so a value can never start a new CSV row). */
const comment = (text: string): string => `# ${text.replace(/[\r\n]+/g, " ").trim()}`;

export function assertNoForbiddenValues(text: string, values: readonly string[] = []): void {
  const lower = text.toLowerCase();
  for (const value of values) {
    const needle = value.trim().toLowerCase();
    if (needle.length >= 3 && lower.includes(needle)) throw new ForbiddenExportValueError();
  }
}

export function auditCsvRow(
  e: AuditEvent,
  syntheticIdOf: AuditCsvInput["syntheticIdOf"],
): string[] {
  return [
    e.id,
    e.occurredAt,
    e.action,
    e.actorId ?? "",
    e.actorRole ?? "",
    e.entityType,
    e.entityId,
    e.patientId === null ? "" : (syntheticIdOf(e.patientId) ?? ""),
    e.facilityId ?? "",
    e.correlationId,
  ];
}

export function buildAuditCsv(input: AuditCsvInput): AuditCsv {
  const { lines } = input;
  const header = [
    CSV_WATERMARK,
    CSV_WATERMARK_RW,
    CSV_SYNTHETIC_LINE,
    comment(lines.synthetic),
    comment(lines.scope.en),
    comment(lines.scope.rw),
    comment(lines.exportedBy.en),
    comment(lines.exportedBy.rw),
    comment(lines.filters.en),
    comment(lines.filters.rw),
    comment(lines.notice.en),
    comment(lines.notice.rw),
    comment(`export_id=${escapeCsvCell(input.exportId)}`),
  ];
  const body = toCsvRows([
    AUDIT_CSV_COLUMNS,
    ...input.rows.map((e) => auditCsvRow(e, input.syntheticIdOf)),
  ]);
  const text = `${CSV_BOM}${header.join(CRLF)}${CRLF}${body}${CRLF}`;
  assertNoForbiddenValues(text, input.forbiddenValues);
  return { text, rowCount: input.rows.length, sha256: sha256Hex(text) };
}

/** Browser download (Blob + temporary anchor). Only called AFTER `export.generated` is stored. */
export function downloadCsv(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** `laif-demo_audit_log_<facility>_<from>_<to>_<sha8>.csv` (FND-07 `EXPORT_FILE_NAME_PATTERN`). */
export function auditCsvFileName(
  facilityId: string,
  period: { from: string; to: string },
  sha256: string,
): string {
  const scope = facilityId.replace(/[^A-Za-z0-9_-]/g, "-");
  return `laif-demo_${AUDIT_EXPORT_TEMPLATE}_${scope}_${period.from}_${period.to}_${sha256.slice(0, 8)}.csv`;
}

// ── Export orchestration (task 7) ────────────────────────────────────────────

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export type AuditExportDeps = {
  repo: CareRepository;
  /** Fixed-language translators: header lines are always EN + RW. */
  t: { en: Tx; rw: Tx };
  /** Test seam (default: browser download). */
  download?: (text: string, fileName: string) => void;
};

export type AuditExportRequest = {
  /** Repository filter of the current view (page / pageSize are ignored: every page is exported). */
  filter: AuditFilterInput;
  /** JSON-safe filter summary (`filterRecord`) and its one-line text (`filterSummary`). */
  filters: Record<string, string | number>;
  filtersText: string;
  persona: { id: string; displayName: string; role: Role };
  facilityId: FacilityId;
  /** Demo-clock instant (ISO UTC). */
  nowIso: string;
  /** Kigali calendar days of the filter (missing bounds: first exported event day / today). */
  period: { from?: string | undefined; to?: string | undefined };
  patients: ReadonlyMap<string, { syntheticIdentifier: string; displayName: string }>;
  idempotencyKey: string;
  exportId: string;
};

export type AuditExportResult = { fileName: string; rowCount: number; auditEventId: string };

const EXPORT_REASON_TEXT = "Facility audit log review (clinical portal)";
const LANGUAGES: readonly Language[] = ["en", "rw"];

async function loadAll(repo: CareRepository, filter: AuditFilterInput): Promise<AuditEvent[]> {
  const items: AuditEvent[] = [];
  for (let page = 1; ; page += 1) {
    const result = await repo.listAuditEvents({ ...filter, page, pageSize: 200 });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

/**
 * 1. Load every row of the filtered (repository-scoped) view; 2. build the CSV; 3. append
 * `export.requested`; 4. `recordExport` (`audit.export` checked on role AND facility scope →
 * `export.generated`, or `export.denied` + FORBIDDEN); 5. only then download. Any failure before
 * step 5 throws and no file is produced.
 */
export async function performAuditExport(
  deps: AuditExportDeps,
  request: AuditExportRequest,
): Promise<AuditExportResult> {
  const { repo, t } = deps;
  const download = deps.download ?? downloadCsv;
  const rows = await loadAll(repo, request.filter);
  const bilingual = (build: (tx: Tx, lng: Language) => string): BilingualLine => {
    const [en, rw] = LANGUAGES.map((lng) => build(lng === "en" ? t.en : t.rw, lng));
    return { en: en ?? "", rw: rw ?? "" };
  };
  const csv = buildAuditCsv({
    exportId: request.exportId,
    rows,
    syntheticIdOf: (id) => request.patients.get(id)?.syntheticIdentifier ?? null,
    lines: {
      synthetic: t.rw("clinical:audit.export.csv.synthetic"),
      scope: bilingual((tx) =>
        tx("clinical:audit.export.csv.scope", {
          facilities: tx("clinical:audit.export.csv.demoFacility", {
            facility: facilityLabel(request.facilityId, tx),
          }),
        }),
      ),
      exportedBy: bilingual((tx, lng) =>
        tx("clinical:audit.export.csv.exportedBy", {
          name: request.persona.displayName,
          role: tx(roleLabelKey(request.persona.role)),
          time: formatDateTime(request.nowIso, lng),
        }),
      ),
      filters: bilingual((tx) =>
        tx("clinical:audit.export.csv.filters", { filters: request.filtersText }),
      ),
      notice: bilingual((tx) => tx("clinical:audit.notice")),
    },
    forbiddenValues: [...request.patients.values()].map((p) => p.displayName),
  });
  const today = kigaliDate(request.nowIso);
  const firstDay =
    rows.length === 0 ? today : kigaliDate(rows[rows.length - 1]?.occurredAt ?? request.nowIso);
  const period = {
    from: request.period.from ?? (firstDay < today ? firstDay : today),
    to: request.period.to ?? today,
  };
  const fileName = auditCsvFileName(request.facilityId, period, csv.sha256);
  await repo.recordAuditEvent({
    action: "export.requested",
    entityType: "export_audit",
    entityId: request.exportId,
    facilityId: request.facilityId,
    changeSummary: {
      template: AUDIT_EXPORT_TEMPLATE,
      idempotencyKey: request.idempotencyKey,
      filters: request.filters,
      rowCount: csv.rowCount,
    },
  });
  const result = await repo.recordExport(
    {
      reasonCode: "other",
      reasonText: EXPORT_REASON_TEXT,
      template: AUDIT_EXPORT_TEMPLATE,
      granularity: "facility",
      scope: { districtIds: [], facilityIds: [request.facilityId] },
      filters: request.filters,
      rowCount: csv.rowCount,
      suppressedCells: 0,
      sha256: csv.sha256,
      exportId: request.exportId,
      period,
      fileName,
    },
    request.idempotencyKey,
  );
  download(csv.text, fileName);
  return { fileName, rowCount: csv.rowCount, auditEventId: result.auditEventId };
}
