/**
 * ThresholdGate (ADM-09): a page that publishes figures mounts only once the small-cell
 * threshold in force is known (`adminKeys.settings()`), so no figure is ever computed at the
 * baseline k while the programme lead has set a stricter one. Settings is not gated (it shows its
 * own states). On failure: an ErrorState with Retry — never figures.
 */
import { ErrorState, errorCodeOf, LoadingSkeleton, PageHeader, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { useAdminSettings } from "../features/settings/queries.ts";

export function ThresholdGate({ children }: { children?: ReactNode }) {
  const t = useTx();
  const settings = useAdminSettings();
  // A known threshold stays in force while a refetch fails (the page shows its own error).
  if (settings.data !== undefined) return <>{children}</>;
  if (!settings.isError) return <LoadingSkeleton variant="card" lines={4} />;
  return (
    <>
      <PageHeader title={t("admin:states.settingsUnavailable")} />
      <ErrorState
        code={errorCodeOf(settings.error) ?? "INTERNAL"}
        onRetry={() => settings.refetch()}
      />
    </>
  );
}
