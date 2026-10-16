import {
  AppHeader,
  Button,
  DemoToolsSheet,
  LanguageSwitcher,
  PersonaSwitcher,
  RoleBanner,
  Screen,
  Section,
  useTx,
} from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useDemoTools } from "../demo-tools.tsx";
import { personaOption } from "../persona-labels.ts";
import { usePersona, useSession } from "../providers.tsx";

/** Settings tab (FND-11): language, demo persona (demo only) and demo tools. */
export function SettingsScreen() {
  const t = useTx();
  const session = useSession();
  const persona = usePersona();
  const queryClient = useQueryClient();
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();
  const [toolsOpen, setToolsOpen] = useState(false);
  const personas = useMemo(
    () => session.available().map((option) => personaOption(option, t)),
    [session, t],
  );
  const current = persona === null ? null : personaOption(persona, t);

  return (
    <Screen
      testID="settings-screen"
      edges={["top", "left", "right"]}
      offline={faults.offline}
      header={
        <AppHeader
          title={t("worker:tabs.settings")}
          subtitle={t("worker:appName")}
          showLanguageSwitcher={false}
        />
      }
    >
      <Section title={t("common:language.label")}>
        <LanguageSwitcher testID="settings-language-switcher" />
      </Section>
      <Section title={t("shell:persona.label")}>
        {current === null ? null : (
          <RoleBanner
            personaName={current.name}
            roleLabel={current.roleLabel}
            {...(current.scopeLabel === undefined ? {} : { scopeLabel: current.scopeLabel })}
            action={
              <PersonaSwitcher
                personas={personas}
                value={current.id}
                onChange={(personaId) => {
                  if (session.switchTo(personaId).ok) void queryClient.invalidateQueries();
                }}
              />
            }
          />
        )}
      </Section>
      <Section title={t("demo:tools.label")}>
        <Button variant="secondary" icon="settings" onPress={() => setToolsOpen(true)}>
          {t("demo:tools.open")}
        </Button>
      </Section>
      <DemoToolsSheet
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onReset={reset}
        faults={faults}
        onFaultChange={setFault}
        scenarios={scenarios}
        onLoadScenario={(id) => void loadScenario(id)}
      />
    </Screen>
  );
}
