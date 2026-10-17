/**
 * Settings (`/clinical/settings`, CLN-02 task 6): Reset demo, Language, Fault simulation and
 * Scenario actions. Open to every clinical persona — demo tooling (FND-06 `demo.reset`), not a
 * privilege; the language card works for everyone. A skeleton shows until the persisted fault
 * configuration has been read.
 */
import { InfoCallout, LoadingSkeleton, useTx } from "@laif/ui-web";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { ACTION_CAPABILITY } from "../../session/capabilities.ts";
import { useSession } from "../../session/useSession.ts";
import { FaultSimulationCard } from "./FaultSimulationCard.tsx";
import { LanguageCard } from "./LanguageCard.tsx";
import { ResetDemoCard } from "./ResetDemoCard.tsx";
import { ScenarioCard } from "./ScenarioCard.tsx";

export function SettingsPage() {
  const t = useTx();
  const { can } = useSession();
  const { faultsReady } = useDemoTools();
  const canUseDemoTools = can(ACTION_CAPABILITY.resetDemo);

  return (
    <>
      <PageHeader title={t("clinical:nav.settings")} subtitle={t("clinical:settings.subtitle")} />
      {!faultsReady ? (
        <div data-testid="settings-skeleton" className="grid gap-4 lg:grid-cols-2">
          <LoadingSkeleton variant="card" lines={3} />
          <LoadingSkeleton variant="card" lines={3} />
        </div>
      ) : (
        <div className="space-y-4">
          {canUseDemoTools ? <InfoCallout>{t("clinical:settings.everyRole")}</InfoCallout> : null}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <LanguageCard />
            {canUseDemoTools ? <ResetDemoCard /> : null}
            {canUseDemoTools ? <FaultSimulationCard /> : null}
            {canUseDemoTools ? <ScenarioCard /> : null}
          </div>
        </div>
      )}
    </>
  );
}
