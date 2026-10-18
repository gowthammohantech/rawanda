/**
 * Your version vs the latest version (HWM-09 task 7) on the FND-10 `ConflictCard`
 * (= CompareTable): your update first, then status, outcome, attempts, due date, assignee and
 * updated at / version for a task (vitals + amendments for a screening). Changed rows are
 * marked `Changed` with an icon. The two decisions are offered by `ResolutionChoice` below it.
 */
import type { JsonValue } from "@laif/domain";
import { formatDate, formatDateTime, useLanguage, type Language } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { ConflictCard, useTx, type ConflictRow, type TranslationKey } from "@laif/ui-native";

import type { ConflictData } from "../../data/syncCenter.ts";

type Translate = ReturnType<typeof useTx>;
type Rec = Record<string, JsonValue> | null;

const field = (record: Rec, key: string): JsonValue | undefined => record?.[key];
const str = (value: JsonValue | undefined): string | null =>
  typeof value === "string" ? value : null;

function personaName(id: string | null): string | null {
  if (id === null) return null;
  return DEMO_PERSONAS.find((p) => p.id === id)?.displayName ?? id;
}

/** One-line summary of what this worker's update does (no free text). */
export function updateSummary(data: ConflictData, t: Translate): string {
  const payload = data.op.payload as Rec;
  const action = str(field(payload, "action"));
  if (action === "record_attempt") {
    const method = str(field(payload, "method"));
    const result = str(field(payload, "result"));
    return [
      t("worker:sync.op.followup.attempt"),
      t("worker:sync.conflict.attemptSummary", {
        method: method === null ? "—" : t(`domain:contactMethod.${method}` as TranslationKey),
        result: result === null ? "—" : t(`domain:contactResult.${result}` as TranslationKey),
      }),
    ].join(" · ");
  }
  if (action === "record_outcome") {
    const outcome = str(field(payload, "outcome"));
    return t("worker:sync.conflict.outcomeSummary", {
      outcome: outcome === null ? "—" : t(`domain:followUpOutcome.${outcome}` as TranslationKey),
    });
  }
  if (data.op.entityType === "screening") {
    const changed = str(field(payload, "field"));
    const after = field(payload, "after");
    return [
      t("worker:sync.op.screening.amend"),
      changed === null ? null : t(`domain:amendableField.${changed}` as TranslationKey),
      after === undefined || after === null || typeof after === "object" ? null : String(after),
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }
  return t(`worker:sync.op.${data.label}` as TranslationKey);
}

function followUpRows(local: Rec, latest: Rec, t: Translate, lng: Language): ConflictRow[] {
  const status = (r: Rec) => {
    const value = str(field(r, "status"));
    return value === null ? "—" : t(`domain:status.followUp.${value}` as TranslationKey);
  };
  const outcome = (r: Rec) => {
    const record = field(r, "outcome");
    const kind =
      record !== null && typeof record === "object" && !Array.isArray(record)
        ? str(record["kind"])
        : null;
    return kind === null
      ? t("worker:sync.conflict.noOutcome")
      : t(`domain:followUpOutcome.${kind}` as TranslationKey);
  };
  const attempts = (r: Rec) => {
    const list = field(r, "attempts");
    return String(Array.isArray(list) ? list.length : 0);
  };
  const due = (r: Rec) => {
    const value = str(field(r, "dueAt"));
    return value === null ? "—" : formatDate(value, lng);
  };
  const assignee = (r: Rec) =>
    personaName(str(field(r, "assignedWorkerId"))) ?? t("worker:sync.conflict.unassigned");
  return [
    row("status", t("worker:sync.conflict.field.status"), status(local), status(latest)),
    row("outcome", t("worker:sync.conflict.field.outcome"), outcome(local), outcome(latest)),
    row("attempts", t("worker:sync.conflict.field.attempts"), attempts(local), attempts(latest)),
    row("dueAt", t("worker:sync.conflict.field.dueAt"), due(local), due(latest)),
    row("assignee", t("worker:sync.conflict.field.assignee"), assignee(local), assignee(latest)),
  ];
}

function screeningRows(local: Rec, latest: Rec, t: Translate): ConflictRow[] {
  const num = (r: Rec, key: string) => {
    const value = field(r, key);
    return typeof value === "number" ? String(value) : "—";
  };
  const glucose = (r: Rec) => {
    const value = field(r, "glucoseValue");
    const unit = str(field(r, "glucoseUnit"));
    return typeof value === "number" ? `${value}${unit === null ? "" : ` ${unit}`}` : "—";
  };
  const status = (r: Rec) => {
    const value = str(field(r, "status"));
    return value === null ? "—" : t(`domain:status.screening.${value}` as TranslationKey);
  };
  const amendments = (r: Rec) => {
    const list = field(r, "amendments");
    return String(Array.isArray(list) ? list.length : 0);
  };
  return [
    row("status", t("worker:sync.conflict.field.status"), status(local), status(latest)),
    row(
      "systolic",
      t("worker:sync.conflict.field.systolic"),
      num(local, "systolic"),
      num(latest, "systolic"),
    ),
    row(
      "diastolic",
      t("worker:sync.conflict.field.diastolic"),
      num(local, "diastolic"),
      num(latest, "diastolic"),
    ),
    row("glucose", t("worker:sync.conflict.field.glucose"), glucose(local), glucose(latest)),
    row(
      "amendments",
      t("worker:sync.conflict.field.amendments"),
      amendments(local),
      amendments(latest),
    ),
  ];
}

function row(id: string, label: string, yours: string, latest: string): ConflictRow {
  return { id, label, yours, latest, changed: yours !== latest };
}

/** Rows of the comparison (exported for tests). */
export function compareRows(data: ConflictData, t: Translate, lng: Language): ConflictRow[] {
  const { local, latest } = data;
  const updated = (r: Rec) => {
    const value = str(field(r, "updatedAt"));
    return value === null ? "—" : formatDateTime(value, lng);
  };
  const version = (r: Rec) => {
    const value = field(r, "version");
    return typeof value === "number" ? String(value) : "—";
  };
  const specific =
    data.op.entityType === "follow_up"
      ? followUpRows(local, latest, t, lng)
      : data.op.entityType === "screening"
        ? screeningRows(local, latest, t)
        : [];
  return [
    {
      id: "update",
      label: t("worker:sync.conflict.yourUpdate"),
      yours: updateSummary(data, t),
      latest: t("worker:sync.conflict.notOnServer"),
      changed: true,
    },
    ...specific,
    row("updatedAt", t("worker:sync.conflict.field.updatedAt"), updated(local), updated(latest)),
    row("version", t("worker:sync.conflict.field.version"), version(local), version(latest)),
  ];
}

export function VersionCompareTable({ data }: { data: ConflictData }) {
  const t = useTx();
  const { language } = useLanguage();
  const changedBy = personaName(data.changedBy);
  return (
    <ConflictCard
      testID="version-compare"
      title={t("worker:sync.conflict.compareTitle")}
      description={t("worker:sync.conflict.compareDescription")}
      rows={compareRows(data, t, language)}
      {...(changedBy === null ? {} : { changedBy })}
      {...(data.changedAt === null ? {} : { changedAt: data.changedAt })}
      // The decisions are offered (with their reasons) by ResolutionChoice.
      resolutions={[]}
      onResolve={() => undefined}
    />
  );
}
