/**
 * Safety & quality selector (ADM-06): `MetricsDataset` of the actor's FULL grant scope → the
 * view's `QualityView`, made only of `AggregateCell`s keyed by metric / field / week / group /
 * reason / facility ids, plus the view's issue queue (operational rows with an opaque record ref,
 * never patient data).
 *
 * Privacy (binding pattern, as the other admin selectors): ONE scope-wide `suppressOverScope`
 * pass, then the selected district / facility picks its cells. Nodes per facility / district /
 * programme, with additive lines:
 * - `screened` with the overview's weekly (`wS:i`) and screening-type (`t:*`) lines, so the
 *   missing-field rate's denominator is hidden exactly as on the overview;
 * - `missing` ← weekly `wm:i`; `mismatch` ← `dupId` + `orphan`, and ← weekly `wx:i`;
 * - fairness groups (`fs:<sex>:<col>`, `fa:<band>:<col>`) ← `flagged` / `dismissed` /
 *   `escalated`; dismissal reasons (`dr:<code>`) ← `dismissed`;
 * - `openQualityIssues` (hierarchy lines only — the same measure and lines as the overview's
 *   needs-attention card, so both pages hide the same cells of the same figure).
 * Missing-field counts per field are not additive (a screening can miss several fields), so they
 * are primary-suppressed nodes without a line. Queue tab counts are row counts of the visible
 * operational queue (product-owner decision: rows are shown to `quality.triage` / `metrics.read`
 * roles; each row is an operational record, not a disclosure).
 */
import {
  AGE_BANDS,
  completedWithoutEvidence,
  countByScreeningType,
  countFlagged,
  countReviewed,
  detectQualityIssues,
  DISMISSAL_REASON_BUCKETS,
  dismissalReasonDistribution,
  duplicateSubmissionsPrevented,
  FLAG_OUTCOME_COLUMNS,
  flagReviewOutcomesByGroup,
  identityMismatchSignals,
  missedFlagProxy,
  openQualityIssueCount,
  overturnedFlagRate,
  rateCell,
  screeningsWithMissingFields,
  weeklyQualityTrend,
  weeklyScreenedVsFlagged,
  type AgeBand,
  type AggregateCell,
  type DismissalReasonBucket,
  type FlagOutcomeColumn,
  type MetricsDataset,
  type SuppressionLine,
} from "@laif/analytics";
import {
  DATA_QUALITY_ISSUE_STATUSES,
  MANDATORY_SCREENING_FIELDS,
  type DataQualityIssue,
  type DataQualityIssueStatus,
  type DataQualityIssueType,
  type DetectedQualityIssue,
  type MandatoryScreeningField,
} from "@laif/contracts";
import { SEX_VALUES, type Sex } from "@laif/domain";

import {
  facilityNode,
  suppressOverScope,
  viewNodeOf,
  type NodeKey,
  type ScopeView,
} from "../metrics/scopeSuppression.ts";

const TYPE_KEYS = ["bpOnly", "glucoseOnly", "both", "neither"] as const;

/** Column totals of the fairness lines. */
const OUTCOME_TOTAL: Record<FlagOutcomeColumn, string> = {
  flagged: "flagged",
  overturned: "dismissed",
  manualEscalation: "escalated",
};

export type QualityWeek = {
  weekStart: string;
  missingFields: AggregateCell;
  mismatches: AggregateCell;
};

export type QualityKpis = {
  screened: AggregateCell;
  missing: AggregateCell;
  /** missing / screened. */
  missingRate: AggregateCell;
  mismatches: AggregateCell;
  duplicateIdentifier: AggregateCell;
  orphanScreening: AggregateCell;
  reviewed: AggregateCell;
  overturned: AggregateCell;
  /** overturned / reviewed (PROXY). */
  overturnedRate: AggregateCell;
  missedFlagProxy: AggregateCell;
  duplicateSubmissions: AggregateCell;
};

export type FairnessCells = {
  total: Record<FlagOutcomeColumn, AggregateCell>;
  sex: Record<Sex, Record<FlagOutcomeColumn, AggregateCell>>;
  age: Record<AgeBand, Record<FlagOutcomeColumn, AggregateCell>>;
};

export type QualityView = {
  threshold: number;
  computedAt: string;
  rulesetVersions: string[];
  excludedConsentWithdrawn: number;
  /** No submitted screening and no issue in the view's period. */
  empty: boolean;
  kpis: QualityKpis;
  byField: Record<MandatoryScreeningField, AggregateCell>;
  invariants: { completedWithoutEvidence: AggregateCell; duplicateSubmissions: AggregateCell };
  weekly: QualityWeek[];
  fairness: FairnessCells;
  dismissalReasons: Record<DismissalReasonBucket, AggregateCell>;
  /** Open (untriaged) issues per facility of the view (suppressed below k). */
  openByFacility: Array<{ facilityId: string; districtId: string; open: AggregateCell }>;
  openTotal: AggregateCell;
};

const fs = (sex: Sex, c: FlagOutcomeColumn) => `fs:${sex}:${c}`;
const fa = (band: AgeBand, c: FlagOutcomeColumn) => `fa:${band}:${c}`;
const dr = (b: DismissalReasonBucket) => `dr:${b}`;
const mf = (f: MandatoryScreeningField) => `mf:${f}`;

/** Raw additive measures of one facility's dataset. */
function facilityMeasures(
  fds: MetricsDataset,
  weeks: { screened: readonly string[]; quality: readonly string[] },
): Map<string, number> {
  const out = new Map<string, number>();
  const missing = screeningsWithMissingFields(fds);
  out.set("screened", missing.screened);
  const weekly = new Map(weeklyScreenedVsFlagged(fds).map((w) => [w.weekStart, w.screened]));
  weeks.screened.forEach((w, i) => out.set(`wS:${i}`, weekly.get(w) ?? 0));
  const types = countByScreeningType(fds);
  for (const t of TYPE_KEYS) out.set(`t:${t}`, types[t]);
  out.set("missing", missing.n);
  for (const f of MANDATORY_SCREENING_FIELDS) out.set(mf(f), missing.byField[f]);
  const mismatch = identityMismatchSignals(fds);
  out.set("dupId", mismatch.duplicateIdentifier);
  out.set("orphan", mismatch.orphanScreening);
  out.set("mismatch", mismatch.duplicateIdentifier + mismatch.orphanScreening);
  const trend = new Map(weeklyQualityTrend(fds).map((w) => [w.weekStart, w]));
  weeks.quality.forEach((w, i) => {
    out.set(`wm:${i}`, trend.get(w)?.missingFields ?? 0);
    out.set(`wx:${i}`, trend.get(w)?.mismatches ?? 0);
  });
  out.set("reviewed", countReviewed(fds));
  out.set("dismissed", overturnedFlagRate(fds).dismissed);
  out.set("flagged", countFlagged(fds));
  out.set("escalated", missedFlagProxy(fds).n);
  out.set("dupSubs", duplicateSubmissionsPrevented(fds));
  out.set("noEvidence", completedWithoutEvidence(fds));
  const fairness = flagReviewOutcomesByGroup(fds);
  for (const c of FLAG_OUTCOME_COLUMNS) {
    for (const s of SEX_VALUES) out.set(fs(s, c), fairness.sex[s][c]);
    for (const b of AGE_BANDS) out.set(fa(b, c), fairness.age[b][c]);
  }
  const reasons = dismissalReasonDistribution(fds);
  for (const b of DISMISSAL_REASON_BUCKETS) out.set(dr(b), reasons[b]);
  out.set("openQualityIssues", openQualityIssueCount(fds));
  return out;
}

function nodeLines(weeks: {
  screened: readonly string[];
  quality: readonly string[];
}): (node: string, key: NodeKey) => SuppressionLine[] {
  return (node, key) => {
    const lines: SuppressionLine[] = [
      { members: weeks.screened.map((_, i) => key(node, `wS:${i}`)), total: key(node, "screened") },
      { members: TYPE_KEYS.map((t) => key(node, `t:${t}`)), total: key(node, "screened") },
      { members: [key(node, "dupId"), key(node, "orphan")], total: key(node, "mismatch") },
      { members: weeks.quality.map((_, i) => key(node, `wm:${i}`)), total: key(node, "missing") },
      { members: weeks.quality.map((_, i) => key(node, `wx:${i}`)), total: key(node, "mismatch") },
      {
        members: DISMISSAL_REASON_BUCKETS.map((b) => key(node, dr(b))),
        total: key(node, "dismissed"),
      },
    ];
    for (const c of FLAG_OUTCOME_COLUMNS) {
      lines.push({
        members: SEX_VALUES.map((s) => key(node, fs(s, c))),
        total: key(node, OUTCOME_TOTAL[c]),
      });
      lines.push({
        members: AGE_BANDS.map((b) => key(node, fa(b, c))),
        total: key(node, OUTCOME_TOTAL[c]),
      });
    }
    return lines.filter((l) => l.members.length > 0);
  };
}

export function selectQuality(ds: MetricsDataset, view: ScopeView, threshold: number): QualityView {
  const weeks = {
    screened: weeklyScreenedVsFlagged(ds).map((w) => w.weekStart),
    quality: weeklyQualityTrend(ds).map((w) => w.weekStart),
  };
  const measures = [
    "screened",
    ...weeks.screened.map((_, i) => `wS:${i}`),
    ...TYPE_KEYS.map((t) => `t:${t}`),
    "missing",
    ...MANDATORY_SCREENING_FIELDS.map(mf),
    "dupId",
    "orphan",
    "mismatch",
    ...weeks.quality.flatMap((_, i) => [`wm:${i}`, `wx:${i}`]),
    "reviewed",
    "dismissed",
    "flagged",
    "escalated",
    "dupSubs",
    "noEvidence",
    ...FLAG_OUTCOME_COLUMNS.flatMap((c) => [
      ...SEX_VALUES.map((s) => fs(s, c)),
      ...AGE_BANDS.map((b) => fa(b, c)),
    ]),
    ...DISMISSAL_REASON_BUCKETS.map(dr),
    "openQualityIssues",
  ];
  const { cellOf, rawOf } = suppressOverScope(
    ds,
    {
      measures,
      facilityMeasures: (fds) => facilityMeasures(fds, weeks),
      nodeLines: nodeLines(weeks),
    },
    threshold,
  );
  const node = viewNodeOf(view);
  const c = (m: string, key = m) => cellOf(node, m, key);
  const screened = c("screened");
  const missing = c("missing");
  const reviewed = c("reviewed");
  const overturned = c("dismissed", "overturned");
  const outcomes = (pick: (col: FlagOutcomeColumn) => string, prefix: string) =>
    Object.fromEntries(
      FLAG_OUTCOME_COLUMNS.map((col) => [col, c(pick(col), `${prefix}:${col}`)]),
    ) as Record<FlagOutcomeColumn, AggregateCell>;
  const viewFacilities = ds.cohort.facilities.filter(
    (f) =>
      (view.facility === null || f.id === view.facility) &&
      (view.district === null || f.districtId === view.district),
  );
  const empty = rawOf(node, "screened") === 0 && rawOf(node, "mismatch") === 0;

  return {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: ds.rulesetVersions,
    excludedConsentWithdrawn: ds.excludedConsentWithdrawn,
    empty,
    kpis: {
      screened,
      missing,
      missingRate: rateCell("missingRate", missing, screened),
      mismatches: c("mismatch"),
      duplicateIdentifier: c("dupId"),
      orphanScreening: c("orphan"),
      reviewed,
      overturned,
      overturnedRate: rateCell("overturnedRate", overturned, reviewed),
      missedFlagProxy: c("escalated", "missedFlagProxy"),
      duplicateSubmissions: c("dupSubs", "duplicateSubmissions"),
    },
    byField: Object.fromEntries(MANDATORY_SCREENING_FIELDS.map((f) => [f, c(mf(f), f)])) as Record<
      MandatoryScreeningField,
      AggregateCell
    >,
    invariants: {
      completedWithoutEvidence: c("noEvidence", "completedWithoutEvidence"),
      duplicateSubmissions: c("dupSubs", "duplicateSubmissions"),
    },
    weekly: weeks.quality.map((weekStart, i) => ({
      weekStart,
      missingFields: c(`wm:${i}`, weekStart),
      mismatches: c(`wx:${i}`, weekStart),
    })),
    fairness: {
      total: outcomes((col) => OUTCOME_TOTAL[col], "total"),
      sex: Object.fromEntries(
        SEX_VALUES.map((s) => [s, outcomes((col) => fs(s, col), `sex:${s}`)]),
      ) as Record<Sex, Record<FlagOutcomeColumn, AggregateCell>>,
      age: Object.fromEntries(
        AGE_BANDS.map((b) => [b, outcomes((col) => fa(b, col), `age:${b}`)]),
      ) as Record<AgeBand, Record<FlagOutcomeColumn, AggregateCell>>,
    },
    dismissalReasons: Object.fromEntries(
      DISMISSAL_REASON_BUCKETS.map((b) => [b, c(dr(b), b)]),
    ) as Record<DismissalReasonBucket, AggregateCell>,
    openByFacility: viewFacilities.map((f) => ({
      facilityId: f.id,
      districtId: f.districtId,
      open: cellOf(facilityNode(f.id), "openQualityIssues", f.id),
    })),
    openTotal: c("openQualityIssues", "openTotal"),
  };
}

// ── Issue queue (operational rows) ──

export const QUEUE_TABS = [
  "open",
  "acknowledged",
  "resolved_with_note",
  "sent_to_facility",
] as const;
export type QueueTab = DataQualityIssueStatus;
export const QUEUE_PAGE_SIZE = 20;

/** Stored triage record of a detected issue (a never-stored issue reads as a fresh `open`). */
export type QueueIssue = DataQualityIssue;

export type QueueSelection = {
  counts: Record<DataQualityIssueStatus, number>;
  /** Issues of the tab (and type filter) on the requested page. */
  rows: QueueIssue[];
  /** Issues in the tab after the type filter (pagination total). */
  total: number;
  page: number;
};

/** Detected issues of the view joined with their stored triage state. */
export function queueIssues(
  ds: MetricsDataset,
  view: ScopeView,
  stored: readonly DataQualityIssue[],
): QueueIssue[] {
  const byId = new Map(stored.map((i) => [i.id, i]));
  return detectQualityIssues(ds)
    .filter(
      (i) =>
        (view.facility === null || i.facilityId === view.facility) &&
        (view.district === null || i.districtId === view.district),
    )
    .map((i) => byId.get(i.id) ?? freshIssue(i, ds.nowIso));
}

function freshIssue(i: DetectedQualityIssue, nowIso: string): DataQualityIssue {
  return {
    ...i,
    status: "open",
    note: null,
    programmeActionId: null,
    updatedBy: null,
    history: [],
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    synthetic: true,
  };
}

/** Tabs + type filter + page of 20 (newest detection first). */
export function selectQueue(
  issues: readonly QueueIssue[],
  tab: DataQualityIssueStatus,
  type: DataQualityIssueType | null,
  page: number,
): QueueSelection {
  const typed = issues.filter((i) => type === null || i.type === type);
  const counts = Object.fromEntries(
    DATA_QUALITY_ISSUE_STATUSES.map((s) => [s, typed.filter((i) => i.status === s).length]),
  ) as Record<DataQualityIssueStatus, number>;
  const inTab = typed
    .filter((i) => i.status === tab)
    .sort((a, b) =>
      a.detectedAt === b.detectedAt ? (a.id < b.id ? -1 : 1) : a.detectedAt > b.detectedAt ? -1 : 1,
    );
  const pages = Math.max(1, Math.ceil(inTab.length / QUEUE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return {
    counts,
    rows: inTab.slice((current - 1) * QUEUE_PAGE_SIZE, current * QUEUE_PAGE_SIZE),
    total: inTab.length,
    page: current,
  };
}
