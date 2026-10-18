/**
 * "FAULT SIMULATION ON" (ADM-09 task 3): a persistent topbar pill while any demo fault is active
 * (latency, server error, timeout, offline, conflict on next write). Links to Settings, where the
 * faults are cleared (Reset demo clears them too). Text + icon; the label is always announced.
 */
import { Icon, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { useDemoTools } from "./demo-tools.tsx";
import { paths } from "./nav.ts";

export function FaultPill() {
  const t = useTx();
  const { faultActive } = useDemoTools();
  if (!faultActive) return null;
  const label = t("admin:settings.faults.pill");
  return (
    <Link
      to={`${paths.settings}#faults`}
      data-testid="fault-pill"
      aria-label={label}
      title={label}
      className="border-risk-danger/30 bg-risk-danger-soft text-risk-danger inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 font-mono text-[11px] font-semibold tracking-wide uppercase"
    >
      <Icon name="alert" size={14} />
      <span aria-hidden="true" className="hidden xl:inline">
        {label}
      </span>
    </Link>
  );
}
