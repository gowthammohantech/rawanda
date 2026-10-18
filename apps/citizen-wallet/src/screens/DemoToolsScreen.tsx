/**
 * Demo tools (CTZ-02 task 13) — DEMO ONLY. Reachable from the welcome footer (no persona) and
 * from More. Reset demo (ConfirmSheet), the pinned demo clock (+1 day / +7 days / baseline via
 * `repo.demo.advanceClock` / `resetClock`) and the FND-07 `FaultConfig` toggles: slow network
 * (`latencyMs`), `error500` (`serverErrorRate`), `unavailable` (`dependencyUnavailableRate`) and
 * `conflict-next-write` (`conflictOnce` on the active patient). Offline + scenarios: the FND-10
 * `DemoToolsSheet`.
 * CTZ-09 task 10: "Simulate care-team confirmation" — DEMO, represents an action in the Clinical
 * Portal (`repo.demo.simulateCareTeamConfirmation`, audited `demo.simulated_staff_action`).
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { RepositoryError } from "@laif/repositories";
import { citizenFaultPatch, type CitizenFaultToggle } from "@laif/repositories/citizen";
import {
  AppHeader,
  AppText,
  Button,
  ConfirmSheet,
  DemoToolsSheet,
  MicroLabel,
  Screen,
  Section,
  Toggle,
  spacing,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useCitizenRepo } from "../data/repo.tsx";
import { useDemoTools } from "../demo-tools.tsx";
import { useWallet } from "../providers.tsx";
import { emitDemoClockChanged } from "../state/events.ts";
import { useTitleFocus } from "../a11y/useTitleFocus.ts";

const DAY_MS = 86_400_000;

type CitizenToggles = Record<CitizenFaultToggle, boolean>;

export function DemoToolsScreen() {
  const t = useTx();
  const titleRef = useTitleFocus();
  const router = useRouter();
  const repo = useCitizenRepo();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { language } = useLanguage();
  const demo = useDemoTools();
  const patientId = useWallet((s) => s.activePatientId);
  const [clockIso, setClockIso] = useState<string | null>(null);
  const [toggles, setToggles] = useState<CitizenToggles>({
    error500: false,
    unavailable: false,
    "conflict-next-write": false,
  });
  const [resetOpen, setResetOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const failed = useCallback(
    () => toast({ title: t("citizen:more.demo.failed"), tone: "danger" }),
    [toast, t],
  );

  const load = useCallback(
    () => Promise.all([repo.demo.getDemoState(), repo.demo.getFaults()]),
    [repo],
  );
  const apply = useCallback(([state, faults]: Awaited<ReturnType<typeof load>>) => {
    setClockIso(state.clockIso);
    setToggles({
      error500: faults.serverErrorRate >= 1,
      unavailable: faults.dependencyUnavailableRate >= 1,
      "conflict-next-write": faults.conflictOnce.length > 0,
    });
  }, []);
  const refresh = useCallback(async () => apply(await load()), [apply, load]);

  useEffect(() => {
    let active = true;
    load().then(
      (result) => {
        if (active) apply(result);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [load, apply, demo.epoch]);

  const setToggle = async (toggle: CitizenFaultToggle, enabled: boolean) => {
    setToggles((previous) => ({ ...previous, [toggle]: enabled }));
    try {
      const target =
        patientId === null ? undefined : { entityType: "patient", entityId: patientId };
      await repo.demo.setFaults(citizenFaultPatch(toggle, enabled, target));
      await refresh();
    } catch {
      setToggles((previous) => ({ ...previous, [toggle]: !enabled }));
      failed();
    }
  };

  const moveClock = async (run: () => Promise<string>) => {
    try {
      setClockIso(await run());
      // CTZ-05: simulated reminder delivery follows the demo clock.
      emitDemoClockChanged();
      await queryClient.invalidateQueries();
    } catch {
      failed();
    }
  };

  /** Returns the promise, so the Button stays busy until it settles (no double submit). */
  const simulateConfirmation = async () => {
    if (patientId === null) return;
    try {
      await repo.demo.simulateCareTeamConfirmation({ patientId });
      await queryClient.invalidateQueries();
      toast({ title: t("citizen:more.demo.simulateDone"), tone: "positive" });
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "VALIDATION_ERROR") {
        toast({ title: t("citizen:more.demo.simulateNothing") });
      } else {
        failed();
      }
    }
  };

  return (
    <Screen
      testID="demo-tools-screen"
      offline={demo.faults.offline}
      header={
        <AppHeader
          titleRef={titleRef}
          title={t("citizen:more.demo.title")}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      }
    >
      <MicroLabel tone="warning">{t("citizen:more.demo.eyebrow")}</MicroLabel>
      <AppText color="muted">{t("citizen:more.demo.intro")}</AppText>

      <Section title={t("citizen:more.demo.reset")}>
        <Button
          variant="danger"
          icon="refresh"
          onPress={() => setResetOpen(true)}
          testID="demo-reset"
        >
          {t("citizen:more.demo.reset")}
        </Button>
      </Section>

      <Section title={t("citizen:more.demo.clockTitle")}>
        <AppText testID="demo-clock">
          {clockIso === null
            ? "…"
            : t("citizen:more.demo.clockNow", { time: formatDateTime(clockIso, language) })}
        </AppText>
        <View style={styles.row}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => moveClock(() => repo.demo.advanceClock(DAY_MS))}
          >
            {t("citizen:more.demo.advanceDay")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => moveClock(() => repo.demo.advanceClock(7 * DAY_MS))}
          >
            {t("citizen:more.demo.advanceWeek")}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => moveClock(() => repo.demo.resetClock())}>
            {t("citizen:more.demo.baseline")}
          </Button>
        </View>
      </Section>

      <Section title={t("citizen:more.demo.simulateTitle")}>
        <MicroLabel tone="warning">{t("citizen:more.demo.eyebrow")}</MicroLabel>
        <AppText color="muted" testID="simulate-confirmation-note">
          {t(
            patientId === null
              ? "citizen:more.demo.simulateNeedsPersona"
              : "citizen:more.demo.simulateNote",
          )}
        </AppText>
        <Button
          variant="secondary"
          icon="check"
          disabled={patientId === null}
          accessibilityHint={t("citizen:more.demo.simulateHint")}
          onPress={simulateConfirmation}
          testID="simulate-confirmation"
        >
          {t("citizen:more.demo.simulateConfirmation")}
        </Button>
      </Section>

      <Section title={t("citizen:more.demo.faultsTitle")}>
        <Toggle
          label={t("citizen:more.demo.slow")}
          value={demo.faults.slow}
          onValueChange={(value) => demo.setFault("slow", value)}
          testID="fault-slow"
        />
        <Toggle
          label={t("citizen:more.demo.error500")}
          value={toggles.error500}
          onValueChange={(value) => void setToggle("error500", value)}
          testID="fault-error500"
        />
        <Toggle
          label={t("citizen:more.demo.unavailable")}
          value={toggles.unavailable}
          onValueChange={(value) => void setToggle("unavailable", value)}
          testID="fault-unavailable"
        />
        <Toggle
          label={t("citizen:more.demo.conflict")}
          description={t("citizen:more.demo.conflictHint")}
          value={toggles["conflict-next-write"]}
          disabled={patientId === null}
          onValueChange={(value) => void setToggle("conflict-next-write", value)}
          testID="fault-conflict"
        />
        <Button variant="secondary" icon="settings" onPress={() => setSheetOpen(true)}>
          {t("citizen:more.demo.moreTools")}
        </Button>
      </Section>

      <ConfirmSheet
        visible={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("citizen:more.demo.resetTitle")}
        description={t("citizen:more.demo.resetBody")}
        confirmLabel={t("citizen:more.demo.reset")}
        variant="destructive"
        onConfirm={async () => {
          await demo.reset();
          setResetOpen(false);
          // The guard re-evaluates the persona against the fresh seed.
          router.replace("/");
        }}
        testID="demo-reset-confirm"
      />
      <DemoToolsSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onReset={demo.reset}
        faults={demo.faults}
        onFaultChange={demo.setFault}
        scenarios={demo.scenarios}
        onLoadScenario={(id) => void demo.loadScenario(id)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
