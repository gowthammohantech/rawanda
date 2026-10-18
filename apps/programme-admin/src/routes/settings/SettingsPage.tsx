/**
 * `/admin/settings` (ADM-09): language (persisted), the small-cell suppression threshold
 * (programme lead only, audited), demo transport fault simulation, the demo session ("Expire
 * session now") and Reset demo. Every role can open it (`metrics.read`); editing the threshold
 * needs `settings.privacy`. Layout: 8/4 grid ≥ 1280 px, stacked below (the right-hand cards need the width in RW).
 */
import { PageHeader, useTx } from "@laif/ui-web";

import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { FaultSimulationPanel } from "../../features/settings/FaultSimulationPanel.tsx";
import { LanguageSetting } from "../../features/settings/LanguageSetting.tsx";
import { ResetDemoCard } from "../../features/settings/ResetDemoCard.tsx";
import { SessionCard } from "../../features/settings/SessionCard.tsx";
import { SuppressionThresholdSetting } from "../../features/settings/SuppressionThresholdSetting.tsx";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function SettingsPage() {
  const t = useTx();
  const title = t("admin:settings.title");
  useDocumentTitle(title);
  return (
    <div className="flex flex-col gap-4" data-testid="settings-page">
      <PageHeader title={title} subtitle={t("admin:settings.subtitle")} />
      <ScopeStrip />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <SuppressionThresholdSetting />
          <FaultSimulationPanel />
        </div>
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
          <LanguageSetting />
          <SessionCard />
          <ResetDemoCard />
        </div>
      </div>
    </div>
  );
}
