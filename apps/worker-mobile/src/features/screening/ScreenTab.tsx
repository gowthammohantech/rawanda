/**
 * Screen tab (HWM-05 task 8): `DRAFTS ON THIS DEVICE` (resume any draft — they survive an app
 * kill) and "Choose patient" → Find in picker mode (`?mode=pick`). Empty → "No drafts. Choose a
 * patient to start." Identical online and offline (drafts never leave the device).
 */
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useDemoTools } from "../../demo-tools.tsx";
import { DraftRow } from "./DraftRow.tsx";
import { useDraftList } from "./useScreeningDrafts.ts";

export function ScreenTab() {
  const t = useTx();
  const router = useRouter();
  const { faults } = useDemoTools();
  const list = useDraftList();
  const choosePatient = () => router.push({ pathname: "/patients", params: { mode: "pick" } });
  const resume = (draftId: string) =>
    router.push({ pathname: "/screenings/draft/[draftId]", params: { draftId } });
  return (
    <Screen
      testID="screen-screen"
      edges={["top", "left", "right"]}
      offline={faults.offline}
      header={<AppHeader title={t("worker:screening.tab.title")} />}
    >
      <Button
        icon="search"
        fullWidth
        testID="choose-patient"
        accessibilityHint={t("worker:screening.tab.choosePatientHint")}
        onPress={choosePatient}
      >
        {t("worker:screening.tab.choosePatient")}
      </Button>
      <View style={styles.section}>
        <MicroLabel heading testID="drafts-label">
          {t("worker:screening.tab.draftsLabel")}
        </MicroLabel>
        <AppText variant="caption" color="muted">
          {t("worker:screening.tab.deviceNote")}
        </AppText>
        {list.isError ? (
          <ErrorState title={t("worker:screening.tab.error")} onRetry={() => list.refetch()} />
        ) : list.data === undefined ? (
          <LoadingState variant="skeleton" rows={2} label={t("worker:screening.tab.loading")} />
        ) : list.data.length === 0 ? (
          <View testID="drafts-empty">
            <EmptyState icon="file" title={t("worker:screening.tab.empty")} />
          </View>
        ) : (
          <View style={styles.list} testID="screen-drafts">
            {list.data.map((row) => (
              <DraftRow key={row.draft.id} row={row} onResume={resume} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { gap: spacing.sm },
});
