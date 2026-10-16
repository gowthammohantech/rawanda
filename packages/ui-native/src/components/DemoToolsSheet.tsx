import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { Button } from "./Button.tsx";
import { ConfirmSheet } from "./ConfirmSheet.tsx";
import { MicroLabel } from "./MicroLabel.tsx";
import { Sheet } from "./Sheet.tsx";
import { Toggle } from "./Toggle.tsx";

/** Toggles mapped by apps onto FND-07 `FaultConfig` (same shape as ui-web `DemoToolsMenu`). */
export type DemoFaultToggles = { offline: boolean; slow: boolean; errors: boolean };
export type DemoFaultKey = keyof DemoFaultToggles;
export type DemoScenarioOption = { id: string; /** Translated title. */ title: string };

export type DemoToolsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Called after the user confirms "Reset demo". May return a promise. */
  onReset: () => unknown;
  faults: DemoFaultToggles;
  onFaultChange: (key: DemoFaultKey, enabled: boolean) => void;
  /** Scenarios for this app; omitted = no scenario loader. */
  scenarios?: readonly DemoScenarioOption[];
  onLoadScenario?: (scenarioId: string) => void;
  /** Extra actions (REL-01 export/import, CTZ time travel). */
  extraItems?: readonly { id: string; label: string; onSelect: () => void }[];
};

const FAULTS: readonly {
  key: DemoFaultKey;
  labelKey: "demo:tools.offline" | "demo:tools.slowNetwork" | "demo:tools.serverErrors";
}[] = [
  { key: "offline", labelKey: "demo:tools.offline" },
  { key: "slow", labelKey: "demo:tools.slowNetwork" },
  { key: "errors", labelKey: "demo:tools.serverErrors" },
];

/** Demo tools: Reset demo (confirmed), Offline / Slow network / Server errors, Load scenario. */
export function DemoToolsSheet({
  visible,
  onClose,
  onReset,
  faults,
  onFaultChange,
  scenarios = [],
  onLoadScenario,
  extraItems = [],
}: DemoToolsSheetProps) {
  const t = useTx();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const confirmReset = async () => {
    setResetting(true);
    try {
      await onReset();
      setConfirmOpen(false);
      onClose();
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Sheet
        visible={visible && !confirmOpen}
        onClose={onClose}
        title={t("demo:tools.label")}
        testID="demo-tools-sheet"
      >
        <Button variant="danger" icon="refresh" fullWidth onPress={() => setConfirmOpen(true)}>
          {t("demo:tools.reset")}
        </Button>
        <MicroLabel heading>{t("demo:tools.faults")}</MicroLabel>
        {FAULTS.map((fault) => (
          <Toggle
            key={fault.key}
            testID={`demo-fault-${fault.key}`}
            label={t(fault.labelKey)}
            value={faults[fault.key]}
            onValueChange={(enabled) => onFaultChange(fault.key, enabled)}
          />
        ))}
        {scenarios.length === 0 || onLoadScenario === undefined ? null : (
          <View style={styles.block}>
            <MicroLabel heading>{t("demo:tools.loadScenario")}</MicroLabel>
            {scenarios.map((scenario) => (
              <Pressable
                key={scenario.id}
                accessibilityRole="button"
                accessibilityLabel={`${scenario.id} ${scenario.title}`}
                {...a11yState({})}
                onPress={() => {
                  onLoadScenario(scenario.id);
                  onClose();
                }}
                style={[touchTarget, styles.scenario]}
              >
                <Icon name="clipboard" size={16} color={colors.muted} />
                <AppText variant="micro" color="muted" dense>
                  {scenario.id}
                </AppText>
                <AppText style={styles.flex}>{scenario.title}</AppText>
              </Pressable>
            ))}
          </View>
        )}
        {extraItems.map((item) => (
          <Button
            key={item.id}
            variant="secondary"
            fullWidth
            onPress={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.label}
          </Button>
        ))}
      </Sheet>
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        variant="destructive"
        title={t("demo:tools.resetTitle")}
        description={t("demo:resetConfirm")}
        confirmLabel={t("demo:tools.reset")}
        loading={resetting}
        onConfirm={confirmReset}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  scenario: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  flex: { flex: 1 },
});
