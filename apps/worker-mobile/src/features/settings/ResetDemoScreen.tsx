/**
 * Settings → Reset demo (HWM-10 task 2). Lists exactly what will be discarded ("3 waiting to
 * sync, 1 need decision, 2 drafts will be permanently removed"), requires typing `RESET` to
 * enable the button (mismatch keeps it disabled), then runs `demo/reset.ts` through the demo
 * tools (reseed device + simulated server, demo clock, audit baseline `demo.reset`, sign out,
 * new device id, language kept) with a progress state, and hands over to sign-in with the toast
 * "Demo data restored". Works offline (nothing leaves the device).
 */
import {
  AppText,
  Button,
  Card,
  InfoCallout,
  LoadingState,
  Screen,
  TextField,
  useTx,
} from "@laif/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useDemoTools } from "../../demo-tools.tsx";
import { countDiscardable, isResetConfirmed } from "../../demo/reset.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";

export type ResetDemoScreenProps = {
  onBack?: () => void;
  /** After a successful reset (navigate to sign-in). */
  onDone: () => void;
};

export function ResetDemoScreen({ onBack, onDone }: ResetDemoScreenProps) {
  const t = useTx();
  const repo = useRepository();
  const { offline } = useNetwork();
  const { reset } = useDemoTools();
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const counts = useQuery({
    queryKey: ["settings", "reset", "counts"],
    queryFn: () => countDiscardable(repo),
  });
  const confirmed = isResetConfirmed(typed);

  const run = async () => {
    if (!confirmed) return;
    setRunning(true);
    const ok = await reset();
    if (ok) onDone();
    else setRunning(false);
  };

  if (running) {
    return (
      <Screen testID="reset-progress">
        <LoadingState label={t("worker:settings.reset.inProgress")} />
      </Screen>
    );
  }

  const data = counts.data;
  return (
    <Screen
      testID="reset-demo-screen"
      offline={offline}
      header={
        <AppHeader
          title={t("worker:settings.reset.title")}
          showAvatar={false}
          {...(onBack === undefined ? {} : { onBack })}
        />
      }
    >
      <InfoCallout icon="refresh">{t("worker:settings.reset.intro")}</InfoCallout>
      {data === undefined ? (
        <LoadingState variant="skeleton" rows={1} label={t("worker:settings.reset.loading")} />
      ) : (
        <Card testID="reset-counts">
          {data.total === 0 ? (
            <AppText testID="reset-nothing-pending">
              {t("worker:settings.reset.nothingPending")}
            </AppText>
          ) : (
            <View accessible accessibilityRole="alert">
              <AppText weight="semibold" color="danger" testID="reset-summary">
                {t("worker:settings.reset.summary", {
                  waiting: t("worker:settings.reset.waiting", { count: data.waiting }),
                  decision: t("worker:settings.reset.decision", { count: data.needsDecision }),
                  drafts: t("worker:settings.reset.drafts", { count: data.drafts }),
                })}
              </AppText>
              <AppText variant="caption" color="muted" testID="reset-warning">
                {t("worker:settings.reset.warning", { count: data.total })}
              </AppText>
            </View>
          )}
        </Card>
      )}
      <TextField
        testID="reset-confirm-input"
        label={t("worker:settings.reset.typeLabel")}
        hint={t("worker:settings.reset.typeHint")}
        accessibilityLabel={t("worker:a11y.resetField")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {typed.trim() !== "" && !confirmed ? (
        <AppText
          color="danger"
          variant="caption"
          testID="reset-mismatch"
          accessibilityLiveRegion="polite"
        >
          {t("worker:settings.reset.mismatch")}
        </AppText>
      ) : null}
      <Button
        testID="reset-confirm"
        variant="danger"
        icon="refresh"
        disabled={!confirmed || data === undefined}
        onPress={run}
      >
        {t("worker:settings.reset.confirm")}
      </Button>
    </Screen>
  );
}
