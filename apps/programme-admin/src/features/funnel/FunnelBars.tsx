/**
 * Funnel share bars (ADM-03 task 4, ref image 2 "Trial funnel"): pure CSS horizontal bars, one
 * row per pathway stage. Each row is a link to `/admin/funnel/<stage>?<filters>` (keyboard
 * focusable) and shows the count, "% of previous" and "% of recorded". The stage with the
 * largest proportional drop carries a `LARGEST DROP · n% of previous` pill — the derived fact
 * only, never advice. "Dismissed with reason" is a separate branch row under Reviewed
 * (`CLOSED WITH REASON`), never mixed into completion (WF-03). Hidden values show `<k`.
 */
import { formatNumber, useLanguage } from "@laif/i18n";
import { cx, useTx, type TranslationKey } from "@laif/ui-web";
import { Link } from "react-router";

import { paths } from "../../app/nav.ts";
import { BAR_FILL_CLASS } from "../../components/charts/chartTheme.ts";
import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import { wholePct, type FunnelView } from "./selectFunnel.ts";

export type FunnelBarsProps = {
  view: FunnelView;
  /** Filter query (`?…`) the stage links keep. */
  search: string;
};

const barWidth = (n: number | null, recorded: number | null): number =>
  n === null || recorded === null || recorded === 0 ? 0 : Math.round((n / recorded) * 100);

export function FunnelBars({ view, search }: FunnelBarsProps) {
  const t = useTx();
  const { language } = useLanguage();
  const k = view.threshold;
  const recorded = view.node.cells.recorded;
  const recordedValue = recorded.suppressed ? null : recorded.value;
  const pct = (value: number | null, key: TranslationKey) =>
    value === null
      ? t("admin:funnel.bars.pctHidden")
      : t(key, { pct: formatNumber(value, language) });

  return (
    <ol
      className="m-0 list-none space-y-2 p-0"
      aria-label={t("admin:funnel.bars.label")}
      data-testid="funnel-bars"
    >
      {view.stages.map((stage) => {
        const label = t(`admin:funnel.stage.${stage.id}` as TranslationKey);
        const shown = stage.n.suppressed ? null : stage.n.value;
        const width = barWidth(shown, recordedValue);
        const drop = view.largestDrop?.id === stage.id ? view.largestDrop : null;
        const previousKey: TranslationKey =
          stage.id === "referred" ? "admin:funnel.bars.ofActioned" : "admin:funnel.bars.ofPrevious";
        return (
          <li key={stage.id}>
            <Link
              to={`${paths.funnelStage(stage.id)}${search}`}
              data-testid={`funnel-stage-${stage.id}`}
              aria-label={t("admin:funnel.bars.linkLabel", { stage: label })}
              className="hover:bg-background focus-visible:bg-background block rounded-md px-3 py-2.5"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-ink text-[13px] font-semibold">{label}</span>
                <span className="text-ink text-lg font-semibold tabular-nums">
                  <SuppressedValue cell={stage.n} threshold={k} />
                </span>
              </span>
              <span
                className="bg-background mt-1.5 block h-3 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <span
                  className={cx("block h-full rounded-full", BAR_FILL_CLASS)}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {stage.id === "recorded" ? (
                  <span>{t("admin:funnel.bars.base")}</span>
                ) : (
                  <span>{pct(wholePct(stage.pctOfPrevious), previousKey)}</span>
                )}
                {stage.id === "recorded" ? null : (
                  <span>{pct(wholePct(stage.pctOfRecorded), "admin:funnel.bars.ofRecorded")}</span>
                )}
                {drop === null ? null : (
                  <span
                    data-testid="largest-drop"
                    className="border-risk-warning/40 bg-risk-warning-soft text-ink rounded-sm border px-1.5 py-px font-mono text-[10px] font-medium tracking-wide"
                  >
                    {t("admin:funnel.bars.largestDrop", {
                      pct: formatNumber(Math.round(drop.pctOfPrevious * 100), language),
                    })}
                  </span>
                )}
              </span>
            </Link>
            {stage.id === "reviewed" ? <DismissedBranch view={view} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function DismissedBranch({ view }: { view: FunnelView }) {
  const t = useTx();
  const { language } = useLanguage();
  const pct = wholePct(view.dismissed.pctOfReviewed);
  return (
    <div
      data-testid="funnel-dismissed"
      className="border-border-soft ms-6 mt-1 mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-s-2 border-dashed py-1.5 ps-3"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-ink text-[13px]">{t("admin:funnel.branch.dismissed")}</span>
        <span className="border-border bg-background text-muted rounded-sm border px-1.5 py-px font-mono text-[10px] font-medium tracking-wide">
          {t("admin:funnel.branch.pill")}
        </span>
      </span>
      <span className="text-muted flex items-baseline gap-3 text-xs">
        <span>
          {pct === null
            ? t("admin:funnel.bars.pctHidden")
            : t("admin:funnel.branch.ofReviewed", { pct: formatNumber(pct, language) })}
        </span>
        <span className="text-ink text-[15px] font-semibold tabular-nums">
          <SuppressedValue cell={view.dismissed.n} threshold={view.threshold} />
        </span>
      </span>
    </div>
  );
}
