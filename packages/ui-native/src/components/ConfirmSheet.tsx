import { hasMinimumReason } from "@laif/domain";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { Button } from "./Button.tsx";
import { ReasonField } from "./ReasonField.tsx";
import { Sheet } from "./Sheet.tsx";

export type ConfirmSheetProps = {
  visible: boolean;
  /** Cancel / backdrop / back button (not while `loading`). */
  onClose: () => void;
  /** Translated title. */
  title: string;
  /** Translated explanation of the effect. */
  description?: string;
  /** Extra body content (summaries). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling (danger button + warning icon + "This cannot be undone."). */
  variant?: "default" | "destructive";
  /** Reason variant: Confirm stays disabled until ≥ 10 non-whitespace characters. */
  requireReason?: boolean;
  reasonLabel?: string;
  confirmDisabled?: boolean;
  /** Saving: Confirm busy, sheet cannot be dismissed. */
  loading?: boolean;
  /** Receives the trimmed reason in the reason variant. May return a promise. */
  onConfirm: (reason?: string) => unknown;
  testID?: string;
};

/** Native confirmation (replaces web `ConfirmDialog`): default, destructive and reason variants. */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  variant = "default",
  requireReason = false,
  reasonLabel,
  confirmDisabled = false,
  loading = false,
  onConfirm,
  testID,
}: ConfirmSheetProps) {
  const t = useTx();
  const [reason, setReason] = useState("");
  // Reset the reason whenever the sheet closes (state adjustment during render).
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) setReason("");
  }
  const destructive = variant === "destructive";
  const reasonValid = !requireReason || hasMinimumReason(reason);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      {...(description === undefined ? {} : { description })}
      dismissible={!loading}
      testID={testID ?? "confirm-sheet"}
      footer={
        <>
          <Button
            variant={destructive ? "danger" : "primary"}
            fullWidth
            loading={loading}
            disabled={confirmDisabled || !reasonValid}
            onPress={() => onConfirm(requireReason ? reason.trim() : undefined)}
          >
            {loading ? t("common:dialog.saving") : (confirmLabel ?? t("common:actions.confirm"))}
          </Button>
          <Button variant="secondary" fullWidth disabled={loading} onPress={onClose}>
            {cancelLabel ?? t("common:actions.cancel")}
          </Button>
        </>
      }
    >
      {destructive ? (
        <View style={styles.warning}>
          <Icon name="alert" size={18} color={colors.danger} />
          <AppText weight="medium" colorValue={colors.danger} style={styles.flex}>
            {t("common:dialog.cannotUndo")}
          </AppText>
        </View>
      ) : null}
      {children ?? null}
      {requireReason ? (
        <ReasonField
          value={reason}
          onChangeText={setReason}
          editable={!loading}
          {...(reasonLabel === undefined ? {} : { label: reasonLabel })}
          testID="confirm-reason"
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  flex: { flex: 1 },
});
