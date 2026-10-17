/**
 * Stage breakdown (ADM-03 task 5, ref image 4 expandable rows): district rows expand to their
 * facility rows. Columns: n, % of previous stage, completion % (completed of referred) and an
 * action menu on facility rows ("Assign programme follow-up"). Aggregates only — no patient
 * rows, names, identifiers or record ids; hidden cells show `<k` (small-cell suppression). The
 * footer row is the stage total of the selected scope, so shown values + hidden markers
 * reconcile to it. Disclosure buttons are native buttons (Enter / Space).
 */
import type { AggregateCell, FunnelNode, FunnelStageId } from "@laif/analytics";
import { formatNumber, useLanguage } from "@laif/i18n";
import { Button, Icon, useTx, type TranslationKey } from "@laif/ui-web";
import { Fragment, useEffect, useId, useRef, useState } from "react";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import { wholePct, type FunnelView } from "./selectFunnel.ts";

export type AssignAvailability = { allowed: true } | { allowed: false; reason: string };

export type StageBreakdownTableProps = {
  view: FunnelView;
  stage: FunnelStageId;
  /** Whether the actor may assign a programme action for a facility (reason when not). */
  canAssign: (facilityId: string) => AssignAvailability;
  onAssign: (facilityId: string) => void;
};

function PctCell({ cell }: { cell: AggregateCell }) {
  const t = useTx();
  const { language } = useLanguage();
  const pct = wholePct(cell);
  if (cell.suppressed) {
    return (
      <span data-suppressed="true">
        <span aria-hidden="true">{t("admin:privacy.suppressed.hidden")}</span>
        <span className="sr-only">{t("admin:funnel.table.pctHiddenSr")}</span>
      </span>
    );
  }
  return (
    <span>{pct === null ? t("admin:privacy.noValue") : `${formatNumber(pct, language)}%`}</span>
  );
}

function Cells({ node, stage, k }: { node: FunnelNode; stage: FunnelStageId; k: number }) {
  return (
    <>
      <td className="py-2.5 pe-3 text-end tabular-nums">
        <SuppressedValue cell={node.cells[stage]} threshold={k} compact />
      </td>
      <td className="py-2.5 pe-3 text-end tabular-nums">
        {stage === "recorded" ? (
          <span aria-hidden="true">—</span>
        ) : (
          <PctCell cell={node.pctOfPrevious[stage]} />
        )}
      </td>
      <td className="py-2.5 pe-3 text-end tabular-nums">
        <PctCell cell={node.pctOfPrevious.completed} />
      </td>
    </>
  );
}

function FacilityActions({
  facilityId,
  availability,
  onAssign,
}: {
  facilityId: string;
  availability: AssignAvailability;
  onAssign: (facilityId: string) => void;
}) {
  const t = useTx();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const reasonId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const facility = facilityLabel(facilityId, t);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("admin:funnel.table.actionsFor", { facility })}
        onClick={() => setOpen((v) => !v)}
        className="target-min text-muted hover:bg-background hover:text-ink inline-flex items-center justify-center rounded-sm"
      >
        <Icon name="more" size={18} />
      </button>
      {open ? (
        <div
          id={panelId}
          className="border-border-soft bg-surface shadow-card absolute end-0 top-10 z-20 w-64 rounded-md border p-2 text-start"
        >
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            className="w-full justify-start"
            aria-disabled={availability.allowed ? undefined : true}
            {...(availability.allowed
              ? {}
              : { "aria-describedby": reasonId, title: availability.reason })}
            onClick={() => {
              if (!availability.allowed) return;
              setOpen(false);
              onAssign(facilityId);
            }}
          >
            {t("admin:actions.assign")}
          </Button>
          {availability.allowed ? null : (
            <p id={reasonId} className="text-muted m-0 mt-1 px-2 text-xs">
              {availability.reason}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function StageBreakdownTable({
  view,
  stage,
  canAssign,
  onAssign,
}: StageBreakdownTableProps) {
  const t = useTx();
  const k = view.threshold;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const stageLabel = t(`admin:funnel.stage.${stage}` as TranslationKey);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" data-testid="stage-breakdown">
        <caption className="sr-only">
          {t("admin:funnel.table.caption", { stage: stageLabel })}
        </caption>
        <thead>
          <tr className="border-border-soft border-b">
            <th scope="col" className="micro-label text-muted py-2 pe-3 text-start font-medium">
              {t("admin:funnel.table.area")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 pe-3 text-end font-medium">
              {t("admin:funnel.table.n")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 pe-3 text-end font-medium">
              {stage === "referred"
                ? t("admin:funnel.table.ofActioned")
                : t("admin:funnel.table.ofPrevious")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 pe-3 text-end font-medium">
              {t("admin:funnel.table.completion")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 text-end font-medium">
              <span className="sr-only">{t("admin:funnel.table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {view.districts.map((d) => {
            const open = expanded.has(d.key);
            const name = districtLabel(d.key, t);
            return (
              <Fragment key={d.key}>
                <tr className="border-border-soft border-b" data-testid={`district-row-${d.key}`}>
                  <th scope="row" className="py-1 pe-3 text-start font-semibold">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(d.key)}
                      className="target-min hover:bg-background inline-flex items-center gap-2 rounded-sm px-1 text-start"
                    >
                      <Icon
                        name={open ? "chevron-up" : "chevron-down"}
                        size={16}
                        className="text-muted"
                      />
                      <span>{name}</span>
                      <span className="sr-only">
                        {open
                          ? t("admin:funnel.table.collapse", { district: name })
                          : t("admin:funnel.table.expand", { district: name })}
                      </span>
                    </button>
                  </th>
                  <Cells node={d} stage={stage} k={k} />
                  <td />
                </tr>
                {open
                  ? d.facilities.map((f) => (
                      <tr
                        key={f.key}
                        className="border-border-soft bg-background/40 border-b"
                        data-testid={`facility-row-${f.key}`}
                      >
                        <th scope="row" className="py-2.5 ps-9 pe-3 text-start font-normal">
                          {facilityLabel(f.key, t)}
                        </th>
                        <Cells node={f} stage={stage} k={k} />
                        <td className="py-1 text-end">
                          <FacilityActions
                            facilityId={f.key}
                            availability={canAssign(f.key)}
                            onAssign={onAssign}
                          />
                        </td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr data-testid="stage-total-row">
            <th scope="row" className="py-2.5 pe-3 text-start font-semibold">
              {t("admin:funnel.table.total")}
            </th>
            <Cells node={view.node} stage={stage} k={k} />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
