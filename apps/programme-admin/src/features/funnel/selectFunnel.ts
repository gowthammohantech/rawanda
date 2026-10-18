/**
 * Funnel selectors (ADM-03 tasks 1–5): `MetricsDataset` (the actor's FULL grant scope) →
 * `FunnelView` for the selected district / facility, made only of `AggregateCell`s keyed by
 * stage, facility, district or week — never a patient or record id.
 *
 * Privacy (ADM-02 open gap "differencing across views"): suppression runs ONCE over the whole
 * grant scope (facility → district → programme + weekly series; since ADM-09 the SAME pass as the
 * overview, `programmeSuppression`, so the two pages never disagree on a shared figure), and every
 * narrower view only picks its cells from that result. So "all districts" and "District Alpha"
 * never hide different cells of the same table, and subtracting one view from another reveals
 * nothing hidden. Consequence: a district view may show a value as hidden that a single-district
 * table would have shown (the price of consistency).
 */
import {
  derivedCell,
  FUNNEL_STAGES,
  largestDrop,
  type AggregateCell,
  type FunnelColumn,
  type FunnelDistrictNode,
  type FunnelFacilityNode,
  type FunnelNode,
  type FunnelStageId,
  type MetricsDataset,
} from "@laif/analytics";

import { funnelHierarchyOf, programmeSuppression } from "../metrics/programmeSuppression.ts";

export type FunnelScopeSelection = { district: string | null; facility: string | null };

export type FunnelStageView = {
  id: FunnelStageId;
  n: AggregateCell;
  pctOfPrevious: AggregateCell;
  pctOfRecorded: AggregateCell;
};

export type FunnelView = {
  threshold: number;
  computedAt: string;
  rulesetVersions: string[];
  excludedConsentWithdrawn: number;
  /** No submitted screening in the selected scope and period. */
  empty: boolean;
  /** The node of the selected scope (programme, district or facility). */
  node: FunnelNode;
  stages: FunnelStageView[];
  dismissed: { n: AggregateCell; pctOfReviewed: AggregateCell };
  /** Lowest shown % of previous (ties → earlier stage); null when no rate is shown. */
  largestDrop: { id: FunnelStageId; pctOfPrevious: number } | null;
  /** Districts → facilities in the selected scope (drill-down rows). */
  districts: FunnelDistrictNode[];
  /** Kigali ISO week starts of the period (weekly trend x axis). */
  weeks: string[];
};

function selectedNode(
  root: FunnelNode,
  districts: FunnelDistrictNode[],
  scope: FunnelScopeSelection,
): FunnelNode | null {
  if (scope.facility !== null) {
    for (const d of districts) {
      const f = d.facilities.find((x) => x.key === scope.facility);
      if (f !== undefined) return f;
    }
    return null;
  }
  if (scope.district !== null) return districts.find((d) => d.key === scope.district) ?? null;
  return root;
}

const zeroNode = (key: string, template: FunnelNode): FunnelNode => {
  const zero = (c: string): AggregateCell => ({
    key: c,
    value: 0,
    suppressed: false,
  });
  const none = (c: string): AggregateCell => ({ key: c, value: null, suppressed: false });
  const by = <T extends string>(ids: readonly T[], f: (id: T) => AggregateCell) =>
    Object.fromEntries(ids.map((id) => [id, f(id)])) as Record<T, AggregateCell>;
  return {
    key,
    cells: by(Object.keys(template.cells) as FunnelColumn[], zero),
    pctOfPrevious: by(FUNNEL_STAGES, none),
    pctOfRecorded: by(FUNNEL_STAGES, none),
    dismissedOfReviewed: none("dismissedOfReviewed"),
  };
};

export function selectFunnel(
  ds: MetricsDataset,
  scope: FunnelScopeSelection,
  threshold: number,
): FunnelView {
  // ADM-09: the funnel reads the pass it shares with the overview (`programmeSuppression`).
  const h = funnelHierarchyOf(ds, programmeSuppression(ds, threshold), threshold);
  const node =
    selectedNode(h.root, h.districts, scope) ??
    zeroNode(scope.facility ?? scope.district ?? "", h.root);
  const districts = h.districts
    .filter((d) => scope.district === null || d.key === scope.district)
    .map((d) => ({
      ...d,
      facilities: d.facilities.filter(
        (f: FunnelFacilityNode) => scope.facility === null || f.key === scope.facility,
      ),
    }))
    .filter((d) => d.facilities.length > 0);
  const stages = FUNNEL_STAGES.map((id): FunnelStageView => ({
    id,
    n: node.cells[id],
    pctOfPrevious: node.pctOfPrevious[id],
    pctOfRecorded: node.pctOfRecorded[id],
  }));
  return {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: ds.rulesetVersions,
    excludedConsentWithdrawn: ds.excludedConsentWithdrawn,
    empty: node.cells.recorded.value === 0,
    node,
    stages,
    dismissed: { n: node.cells.dismissed, pctOfReviewed: node.dismissedOfReviewed },
    largestDrop: largestDrop({
      stages: stages.map((s) => ({
        id: s.id,
        pctOfPrevious: s.pctOfPrevious.suppressed ? null : s.pctOfPrevious.value,
      })),
    }),
    districts,
    weeks: h.weeks,
  };
}

/** Change of a stage count vs the previous equal-length period (hidden with either side). */
export function changeCell(current: AggregateCell, previous: AggregateCell): AggregateCell {
  if (current.suppressed) return derivedCell("change", null, current);
  if (previous.suppressed) return derivedCell("change", null, previous);
  if (current.value === null || previous.value === null) {
    return { key: "change", value: null, suppressed: false };
  }
  return { key: "change", value: current.value - previous.value, suppressed: false };
}

/** Whole percent of a rate cell, or null when hidden / undefined. */
export function wholePct(cell: AggregateCell): number | null {
  return cell.suppressed || cell.value === null ? null : Math.round(cell.value * 100);
}

/** The previous period of equal length (ends the day before `from`). */
export function previousPeriod(period: { from: string; to: string }): { from: string; to: string } {
  const day = 86_400_000;
  const fromMs = Date.parse(`${period.from}T00:00:00.000Z`);
  const toMs = Date.parse(`${period.to}T00:00:00.000Z`);
  const length = Math.round((toMs - fromMs) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(fromMs - length * day), to: iso(fromMs - day) };
}
