/**
 * Scope-wide suppression builder (ADM-03 pattern, shared by every admin page selector).
 *
 * ONE `suppressLines` pass over the dataset of the actor's FULL grant scope: every additive
 * measure is a node at facility (`f|id`), district (`d|id`) and programme (`r|all`) level, linked
 * by the lines facility → district → programme, plus per-node lines a page adds (series / parts
 * that sum to a count). A page then only PICKS its view's cells from the result.
 *
 * Lines are pushed in a fixed order (per district: its facilities' node lines, the district's
 * hierarchy lines in measure order, the district's node lines; then the programme), so two pages
 * that publish the same measures with the same node lines get IDENTICAL suppression for them
 * (`protectLines` is deterministic per connected group of lines). The needs-attention measures
 * (`ATTENTION_MEASURES`) are shared this way by the overview and `/admin/timeliness`, so the two
 * pages never hide different cells of the same figure.
 */
import {
  needsAttention,
  overdueSnapshot,
  pendingAgeBuckets,
  PENDING_AGE_BUCKETS,
  suppressLines,
  type AggregateCell,
  type MetricsDataset,
  type SuppressionLine,
} from "@laif/analytics";

import { restrictDataset } from "./restrictDataset.ts";

export const ROOT_NODE = "r|all";
export const facilityNode = (id: string): string => `f|${id}`;
export const districtNode = (id: string): string => `d|${id}`;

export type ScopeView = { district: string | null; facility: string | null };

/** Node of the selected view (programme, one district or one facility). */
export function viewNodeOf(view: ScopeView): string {
  return view.facility !== null
    ? facilityNode(view.facility)
    : view.district !== null
      ? districtNode(view.district)
      : ROOT_NODE;
}

export type NodeKey = (node: string, measure: string) => string;

export type ScopeSuppression = {
  /** The cell of `measure` at `node` (key `cellKey`, default the measure). */
  cellOf: (node: string, measure: string, cellKey?: string) => AggregateCell;
  /** Raw (unsuppressed) value — invariant tests only; never rendered. */
  rawOf: (node: string, measure: string) => number;
};

export type ScopeSuppressionSpec = {
  measures: readonly string[];
  /** Raw additive measures of one facility's dataset. */
  facilityMeasures: (facilityDs: MetricsDataset, facilityId: string) => Map<string, number>;
  /** Extra additive lines of a node (series / parts summing to a count). */
  nodeLines: (node: string, key: NodeKey) => SuppressionLine[];
};

export function suppressOverScope(
  ds: MetricsDataset,
  spec: ScopeSuppressionSpec,
  threshold: number,
): ScopeSuppression {
  const { measures } = spec;
  const values = new Map<string, number>();
  const lines: SuppressionLine[] = [];
  const key: NodeKey = (node, measure) => `${node}#${measure}`;
  const districtIds = ds.cohort.districts.map((d) => d.id as string);
  const rootTotals = new Map(measures.map((m) => [m, 0]));
  for (const d of districtIds) {
    const dNode = districtNode(d);
    const members = ds.cohort.facilities.filter((f) => f.districtId === d);
    const dTotals = new Map(measures.map((m) => [m, 0]));
    for (const f of members) {
      const fNode = facilityNode(f.id);
      const raw = spec.facilityMeasures(restrictDataset(ds, { facilityIds: [f.id] }), f.id);
      for (const m of measures) {
        const n = raw.get(m) ?? 0;
        values.set(key(fNode, m), n);
        dTotals.set(m, (dTotals.get(m) ?? 0) + n);
      }
      lines.push(...spec.nodeLines(fNode, key));
    }
    for (const m of measures) {
      const n = dTotals.get(m) ?? 0;
      values.set(key(dNode, m), n);
      rootTotals.set(m, (rootTotals.get(m) ?? 0) + n);
      lines.push({
        members: members.map((f) => key(facilityNode(f.id), m)),
        total: key(dNode, m),
      });
    }
    lines.push(...spec.nodeLines(dNode, key));
  }
  for (const m of measures) {
    values.set(key(ROOT_NODE, m), rootTotals.get(m) ?? 0);
    lines.push({
      members: districtIds.map((d) => key(districtNode(d), m)),
      total: key(ROOT_NODE, m),
    });
  }
  lines.push(...spec.nodeLines(ROOT_NODE, key));

  const out = suppressLines(values, lines, threshold);
  return {
    cellOf: (node, measure, cellKey = measure) => {
      const n = out.get(key(node, measure));
      if (n === undefined) return { key: cellKey, value: 0, suppressed: false };
      return n.reason === undefined
        ? { key: cellKey, value: n.value, suppressed: n.suppressed }
        : { key: cellKey, value: n.value, suppressed: n.suppressed, reason: n.reason };
    },
    rawOf: (node, measure) => values.get(key(node, measure)) ?? 0,
  };
}

// ── Needs-attention measures shared by the overview and Timeliness ──

/** Pending-review buckets as nodes (`age:8+` = `8-14` + `15+`; `pending` = all buckets). */
export const ATTENTION_MEASURES = [
  "overdueReferrals",
  "overdueFollowUps",
  "openQualityIssues",
  ...PENDING_AGE_BUCKETS.map((b) => `age:${b}` as const),
  "age:8+",
  "pending",
] as const;

/** Raw needs-attention measures of a dataset (the ADM-04 timeliness calculators). */
export function attentionMeasures(fds: MetricsDataset): Map<string, number> {
  const out = new Map<string, number>();
  const overdue = overdueSnapshot(fds);
  const buckets = pendingAgeBuckets(fds);
  out.set("overdueReferrals", overdue.referrals);
  out.set("overdueFollowUps", overdue.followUps);
  out.set("openQualityIssues", needsAttention(fds).openQualityIssues);
  for (const b of PENDING_AGE_BUCKETS) out.set(`age:${b}`, buckets[b]);
  out.set("age:8+", buckets["8-14"] + buckets["15+"]);
  out.set(
    "pending",
    PENDING_AGE_BUCKETS.reduce((a, b) => a + buckets[b], 0),
  );
  return out;
}

export function attentionLines(node: string, key: NodeKey): SuppressionLine[] {
  return [
    { members: [key(node, "age:8-14"), key(node, "age:15+")], total: key(node, "age:8+") },
    {
      members: [key(node, "age:0-2"), key(node, "age:3-7"), key(node, "age:8+")],
      total: key(node, "pending"),
    },
  ];
}
