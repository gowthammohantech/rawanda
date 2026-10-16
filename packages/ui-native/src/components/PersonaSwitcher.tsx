import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { Button } from "./Button.tsx";
import { Sheet } from "./Sheet.tsx";

export type PersonaOption = {
  id: string;
  /** Synthetic display name. */
  name: string;
  /** Translated role label. */
  roleLabel: string;
  /** Translated scope (facility / district). */
  scopeLabel?: string;
};

export type PersonaSwitcherProps = {
  personas: readonly PersonaOption[];
  value: string;
  onChange: (personaId: string) => void;
  /** Extra actions in the sheet (e.g. "Sign out"). */
  extraItems?: readonly { id: string; label: string; onSelect: () => void }[];
  testID?: string;
};

/** Initials of a synthetic display name ("Aline Uwase" → "AU"). */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/u)
    .filter((part) => part !== "");
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function Initials({ name }: { name: string }) {
  return (
    <View style={styles.avatar} aria-hidden>
      <AppText variant="caption" weight="bold" colorValue={colors.primaryDark} dense>
        {initialsOf(name)}
      </AppText>
    </View>
  );
}

/** Avatar button + sheet for the demo persona switch — labelled demo-only, never authentication. */
export function PersonaSwitcher({
  personas,
  value,
  onChange,
  extraItems = [],
  testID,
}: PersonaSwitcherProps) {
  const t = useTx();
  const [open, setOpen] = useState(false);
  const current = personas.find((persona) => persona.id === value);
  return (
    <>
      <Pressable
        testID={testID ?? "persona-switcher"}
        accessibilityRole="button"
        accessibilityLabel={
          current === undefined
            ? t("shell:persona.switch")
            : `${t("shell:persona.current", { name: current.name })}. ${t("shell:persona.switch")}`
        }
        accessibilityHint={t("common:a11y.opensOptions")}
        {...a11yState({ expanded: open })}
        onPress={() => setOpen(true)}
        style={[touchTarget, styles.trigger]}
      >
        <Initials name={current?.name ?? "?"} />
        <Icon name="chevron-down" size={14} color={colors.muted} />
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t("shell:persona.switch")}
        description={t("demo:demoRoleSwitcher")}
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("shell:persona.label")}
          style={styles.list}
        >
          {personas.map((persona) => {
            const selected = persona.id === value;
            const detail =
              persona.scopeLabel === undefined
                ? persona.roleLabel
                : `${persona.roleLabel} · ${persona.scopeLabel}`;
            return (
              <Pressable
                key={persona.id}
                accessibilityRole="radio"
                accessibilityLabel={`${persona.name}, ${detail}`}
                {...a11yState({ checked: selected, selected })}
                onPress={() => {
                  setOpen(false);
                  if (!selected) onChange(persona.id);
                }}
                style={[touchTarget, styles.row, selected ? styles.rowOn : null]}
              >
                <Initials name={persona.name} />
                <View style={styles.flex}>
                  <AppText weight="semibold">{persona.name}</AppText>
                  <AppText variant="caption" color="muted">
                    {detail}
                  </AppText>
                </View>
                {selected ? <Icon name="check" size={18} color={colors.primaryDark} /> : null}
              </Pressable>
            );
          })}
        </View>
        {extraItems.map((item) => (
          <Button
            key={item.id}
            variant="secondary"
            fullWidth
            onPress={() => {
              setOpen(false);
              item.onSelect();
            }}
          >
            {item.label}
          </Button>
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  list: { gap: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  rowOn: { backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
});
