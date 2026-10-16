import { AppHeader, EmptyState, RoleBanner, Screen, useTx } from "@laif/ui-native";

import { useDemoTools } from "../demo-tools.tsx";
import { personaOption } from "../persona-labels.ts";
import { usePersona } from "../providers.tsx";

/** My health tab placeholder (results arrive in CTZ-03). */
export function HomeScreen() {
  const t = useTx();
  const persona = usePersona();
  const { faults } = useDemoTools();
  const option = persona === null ? null : personaOption(persona, t);
  return (
    <Screen
      testID="home-screen"
      edges={["top", "left", "right"]}
      offline={faults.offline}
      header={<AppHeader title={t("citizen:tabs.health")} subtitle={t("citizen:appName")} />}
    >
      {option === null ? null : (
        <RoleBanner
          personaName={option.name}
          roleLabel={option.roleLabel}
          {...(option.scopeLabel === undefined ? {} : { scopeLabel: option.scopeLabel })}
        />
      )}
      <EmptyState
        icon="clock"
        title={t("citizen:placeholder.comingSoon", { phase: "CTZ-03" })}
        description={t("citizen:placeholder.description")}
      />
    </Screen>
  );
}
