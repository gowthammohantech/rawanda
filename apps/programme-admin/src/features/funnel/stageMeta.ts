/** Stage metadata shared by the funnel pages: catalogue metric per stage, page subtitle. */
import type { FunnelStageId, MetricDefinitionId } from "@laif/analytics";
import { formatDate, useLanguage } from "@laif/i18n";
import { useTx } from "@laif/ui-web";

import { reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession } from "../../app/providers.tsx";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";

/** Catalogue definition behind each stage (ADM-02 `METRIC_DEFINITIONS`). */
export const STAGE_METRIC: Record<FunnelStageId, MetricDefinitionId> = {
  recorded: "screened",
  flagged: "flagged",
  reviewed: "reviewed",
  referred: "referred",
  completed: "followUpCompleted",
};

export function useFunnelHeader(api: AdminFiltersApi): { subtitle: string } {
  const t = useTx();
  const { language } = useLanguage();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);
  return {
    subtitle: t("admin:funnel.subtitle", {
      from: formatDate(`${api.period.from}T12:00:00.000Z`, language),
      to: formatDate(`${api.period.to}T12:00:00.000Z`, language),
      scope,
    }),
  };
}
