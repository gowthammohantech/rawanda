import { FUNNEL_STAGES } from "@laif/analytics";
import { useParams } from "react-router";

import { NotFoundPage } from "../errors/NotFoundPage.tsx";
import { PlaceholderPage } from "../PlaceholderPage.tsx";

/** `/admin/funnel/:stage` — an unknown stage is a 404; the drill-down arrives in ADM-03. */
export function FunnelStagePage() {
  const { stage } = useParams();
  if (!(FUNNEL_STAGES as readonly string[]).includes(stage ?? "")) return <NotFoundPage />;
  return <PlaceholderPage titleKey="admin:nav.funnel" phase="ADM-03" />;
}
