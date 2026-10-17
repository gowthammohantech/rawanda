/**
 * Connection banner (CLN-02 task 7), mounted in the shell under the RoleBanner: "Simulated
 * offline — changes cannot be saved" while the offline fault is on, and a "Simulated faults
 * active" pill (link to Settings) while any fault simulation differs from the defaults.
 */
import { Icon, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { useDemoTools } from "../app/demo-tools.tsx";
import { routes } from "../app/routes.ts";
import { anyFaultActive } from "../data/faults.ts";

export function ConnectionBanner() {
  const t = useTx();
  const { faultConfig } = useDemoTools();
  const active = anyFaultActive(faultConfig);
  if (!faultConfig.offline && !active) return null;
  return (
    <div data-testid="connection-banner" className="flex flex-col gap-2">
      {faultConfig.offline ? (
        <div
          role="status"
          className="border-risk-warning/25 bg-risk-warning-soft text-risk-warning flex flex-wrap items-center gap-2 rounded-md border px-4 py-2 text-[13px]"
        >
          <Icon name="wifi-off" size={16} />
          <span className="font-semibold">{t("clinical:settings.faults.offlineBanner")}</span>
        </div>
      ) : null}
      {active ? (
        <p className="m-0">
          <Link
            to={routes.settings()}
            data-testid="faults-active-pill"
            className="rounded-pill bg-warning-soft text-warning micro-label target-min inline-flex items-center gap-1.5 px-3 py-1"
          >
            <Icon name="alert" size={14} />
            {t("clinical:settings.faults.activeBadge")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
