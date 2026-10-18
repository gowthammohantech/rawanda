/**
 * ONE joint suppression pass for the Overview AND the Pathway funnel (ADM-09 open item:
 * "overview vs funnel independent suppression passes").
 *
 * Before ADM-09 the overview (`suppressOverScope`) and the funnel (`funnelHierarchy`) each ran
 * their own complementary suppression. Both publish the SAME figures (screenings recorded,
 * flagged, reviewed, dismissed, referred, at facility / district / programme level, plus the
 * weekly recorded / flagged series), and complementary choices are made per pass — so a value
 * hidden complementarily on one page could be shown on the other, and subtracting would recover
 * the hidden cell. Now both pages pick their cells from this single pass:
 *
 * - the shared figures are ONE node each (`FUNNEL_ALIAS`: funnel `recorded` IS the overview
 *   `screened` node, `flagged` ↔ `flagged`, …; definitions are identical — see
 *   `programmeSuppression.test.ts`), the weekly series of every funnel column likewise
 *   (`recorded` ↔ `wS:i`, `flagged` ↔ `wF:i`);
 * - measures only one page publishes (overview `actioned`, `followUpCompleted`, the screening
 *   type split and the needs-attention counts; funnel `completed` and the weekly series of the
 *   later stages) are extra nodes in the same pass with their additive lines.
 *
 * The needs-attention measures form their own connected group of lines (no line links them to
 * the funnel figures), so `protectLines` hides exactly the same cells there as the Timeliness
 * page's pass (`ATTENTION_MEASURES`, unchanged reconciliation).
 */
import {
  countByFacility,
  countByScreeningType,
  FUNNEL_COLUMNS,
  funnelRateCells,
  funnelScreeningSets,
  kigaliIsoWeekStart,
  OVERVIEW_COUNT_METRICS,
  weeklyScreenedVsFlagged,
  type AggregateCell,
  type FunnelColumn,
  type FunnelDistrictNode,
  type FunnelHierarchy,
  type FunnelNode,
  type MetricsDataset,
  type SuppressionLine,
} from "@laif/analytics";

import {
  ATTENTION_MEASURES,
  attentionLines,
  attentionMeasures,
  districtNode,
  facilityNode,
  ROOT_NODE,
  suppressOverScope,
  type NodeKey,
  type ScopeSuppression,
} from "./scopeSuppression.ts";

/** Screening-type parts of the overview card (sum to `screened`). */
export const TYPE_KEYS = ["bpOnly", "glucoseOnly", "both", "neither"] as const;

/** The node measure of each funnel column (shared with the overview where identical). */
export const FUNNEL_ALIAS: Readonly<Record<FunnelColumn, string>> = {
  recorded: "screened",
  flagged: "flagged",
  reviewed: "reviewed",
  referred: "referred",
  completed: "fn:completed",
  dismissed: "dismissed",
};

/** Weekly series node measure of a funnel column (`wS` / `wF` are the overview's series). */
export function weekMeasure(week: number, column: FunnelColumn): string {
  if (column === "recorded") return `wS:${week}`;
  if (column === "flagged") return `wF:${week}`;
  return `w:${week}:${column}`;
}

export type ProgrammeSuppression = ScopeSuppression & {
  /** Kigali ISO week starts of the period (both pages' x axis). */
  weeks: string[];
};

function facilityMeasures(fds: MetricsDataset, weeks: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of OVERVIEW_COUNT_METRICS) {
    out.set(
      m,
      countByFacility(fds, m).reduce((a, r) => a + r.value, 0),
    );
  }
  const sets = funnelScreeningSets(fds);
  out.set(FUNNEL_ALIAS.completed, sets.completed.size);
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  const series = new Map<string, number>();
  for (const s of fds.cohort.screenings) {
    const w = weekIndex.get(kigaliIsoWeekStart(s.measuredAt));
    if (w === undefined) continue;
    for (const c of FUNNEL_COLUMNS) {
      if (!sets[c].has(s.id)) continue;
      const key = weekMeasure(w, c);
      series.set(key, (series.get(key) ?? 0) + 1);
    }
  }
  weeks.forEach((_, i) => {
    for (const c of FUNNEL_COLUMNS) out.set(weekMeasure(i, c), series.get(weekMeasure(i, c)) ?? 0);
  });
  const types = countByScreeningType(fds);
  for (const t of TYPE_KEYS) out.set(`t:${t}`, types[t]);
  for (const [m, n] of attentionMeasures(fds)) out.set(m, n);
  return out;
}

/** The joint pass over the actor's FULL grant scope (both pages pick their cells from it). */
export function programmeSuppression(ds: MetricsDataset, threshold: number): ProgrammeSuppression {
  const weeks = weeklyScreenedVsFlagged(ds).map((w) => w.weekStart);
  const measures = [
    ...OVERVIEW_COUNT_METRICS,
    FUNNEL_ALIAS.completed,
    ...weeks.flatMap((_, i) => FUNNEL_COLUMNS.map((c) => weekMeasure(i, c))),
    ...TYPE_KEYS.map((t) => `t:${t}`),
    ...ATTENTION_MEASURES,
  ];
  const nodeLines = (node: string, key: NodeKey): SuppressionLine[] => [
    ...FUNNEL_COLUMNS.map((c) => ({
      members: weeks.map((_, i) => key(node, weekMeasure(i, c))),
      total: key(node, FUNNEL_ALIAS[c]),
    })),
    { members: TYPE_KEYS.map((t) => key(node, `t:${t}`)), total: key(node, "screened") },
    ...attentionLines(node, key),
  ];
  const pass = suppressOverScope(
    ds,
    { measures, facilityMeasures: (fds) => facilityMeasures(fds, weeks), nodeLines },
    threshold,
  );
  return { ...pass, weeks };
}

/** The funnel hierarchy (ADM-03 shape) read from the joint pass. */
export function funnelHierarchyOf(
  ds: MetricsDataset,
  pass: ProgrammeSuppression,
  threshold: number,
): FunnelHierarchy {
  const cellsAt = (node: string): Record<FunnelColumn, AggregateCell> =>
    Object.fromEntries(
      FUNNEL_COLUMNS.map((c) => [c, pass.cellOf(node, FUNNEL_ALIAS[c], c)]),
    ) as Record<FunnelColumn, AggregateCell>;
  const nodeOf = (key: string, node: string): FunnelNode => {
    const cells = cellsAt(node);
    return { key, cells, ...funnelRateCells(cells) };
  };
  const districts: FunnelDistrictNode[] = ds.cohort.districts.map((d) => ({
    ...nodeOf(d.id, districtNode(d.id)),
    facilities: ds.cohort.facilities
      .filter((f) => f.districtId === d.id)
      .map((f) => ({
        ...nodeOf(f.id, facilityNode(f.id)),
        districtId: d.id,
        weekly: pass.weeks.map(
          (_, w) =>
            Object.fromEntries(
              FUNNEL_COLUMNS.map((c) => [c, pass.cellOf(facilityNode(f.id), weekMeasure(w, c), c)]),
            ) as Record<FunnelColumn, AggregateCell>,
        ),
      })),
  }));
  const all = [nodeOf("all", ROOT_NODE), ...districts, ...districts.flatMap((d) => d.facilities)];
  return {
    threshold,
    root: nodeOf("all", ROOT_NODE),
    districts,
    weeks: pass.weeks,
    suppressedCount: all.reduce(
      (n, node) => n + Object.values(node.cells).filter((c) => c.suppressed).length,
      0,
    ),
  };
}
