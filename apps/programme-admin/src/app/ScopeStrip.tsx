/** Scope strip under each page header: shield + "Viewing aggregate data" + the scope label. */
import { Icon, useTx } from "@laif/ui-web";
import { useLocation } from "react-router";

import { resolveScopeFromSearch } from "../auth/scope.ts";
import { reportingScopeLabel } from "./persona-labels.ts";
import { useAdminSession } from "./providers.tsx";

export function ScopeStrip() {
  const t = useTx();
  const location = useLocation();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  if (persona === null) return null;
  const scope = reportingScopeLabel(
    persona,
    grant,
    session,
    resolveScopeFromSearch(location.search),
    t,
  );
  return (
    <p
      data-testid="scope-strip"
      className="border-border-soft bg-surface text-ink flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-[13px]"
    >
      <Icon name="shield" size={16} className="text-primary-dark shrink-0" />
      <span className="font-semibold">{t("admin:shell.scopeStrip")}</span>
      <span className="text-muted">{t("admin:shell.scopeStripLabel", { scope })}</span>
    </p>
  );
}
