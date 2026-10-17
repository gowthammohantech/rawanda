/**
 * Next steps list (CTZ-04): Upcoming first (prototype "YOUR NEXT STEP" cards), then Done, then
 * Cancelled, each with a count; skeleton / empty (+ Support link) / error + Retry states and
 * pull-to-refresh. Only care-team-approved steps exist here. Logs
 * `citizen.next_step.list_viewed` once per focus.
 */
import type { ApprovedInstruction } from "@laif/domain";
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  Section,
  colors,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { useActivePatient } from "../health/useResults.ts";
import { CompletedStepRow } from "./CompletedStepRow.tsx";
import { NextStepCard } from "./NextStepCard.tsx";
import {
  groupNextSteps,
  nextStepErrorKind,
  useNextSteps,
  useNextStepsListViewLog,
} from "./useNextSteps.ts";

export function NextStepsListScreen() {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const steps = useNextSteps(patientId);
  const [refreshing, setRefreshing] = useState(false);
  useNextStepsListViewLog(patientId);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await steps.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const open = (step: ApprovedInstruction) =>
    router.push({ pathname: "/next-steps/[instructionId]", params: { instructionId: step.id } });
  const sectionTitle = (key: TranslationKey, count: number) =>
    t("citizen:nextSteps.sectionCount", { title: t(key), count });

  let body;
  if (steps.isError && nextStepErrorKind(steps.error) !== "consent") {
    body = (
      <ErrorState
        message={t("citizen:nextSteps.error")}
        onRetry={() => steps.refetch()}
        {...(typeof (steps.error as { code?: unknown }).code === "string"
          ? { code: (steps.error as { code: string }).code }
          : {})}
      />
    );
  } else if (steps.data === undefined) {
    body = <LoadingState variant="skeleton" rows={1} label={t("citizen:nextSteps.loading")} />;
  } else if (steps.data.length === 0) {
    body = (
      <EmptyState
        icon="calendar"
        title={t("citizen:nextSteps.empty.title")}
        description={t("citizen:nextSteps.empty.body")}
        action={
          <Button
            variant="secondary"
            onPress={() => router.push("/more")}
            accessibilityHint={t("citizen:nextSteps.supportHint")}
            testID="next-steps-support"
          >
            {t("citizen:nextSteps.supportLink")}
          </Button>
        }
      />
    );
  } else {
    const groups = groupNextSteps(steps.data);
    body = (
      <View
        style={styles.sections}
        accessibilityLabel={t("citizen:nextSteps.listLabel")}
        testID="next-steps-list"
      >
        {groups.upcoming.length > 0 ? (
          <Section
            title={sectionTitle("citizen:nextSteps.section.upcoming", groups.upcoming.length)}
            testID="section-upcoming"
          >
            <View style={styles.list}>
              {groups.upcoming.map((step, index) => (
                <NextStepCard
                  key={step.id}
                  step={step}
                  label={index === 0 ? "kicker" : "type"}
                  onOpen={() => open(step)}
                />
              ))}
            </View>
          </Section>
        ) : null}
        {groups.done.length > 0 ? (
          <Section
            title={sectionTitle("citizen:nextSteps.section.done", groups.done.length)}
            testID="section-done"
          >
            <View style={styles.list}>
              {groups.done.map((step) => (
                <CompletedStepRow key={step.id} step={step} onOpen={() => open(step)} />
              ))}
            </View>
          </Section>
        ) : null}
        {groups.cancelled.length > 0 ? (
          <Section
            title={sectionTitle("citizen:nextSteps.section.cancelled", groups.cancelled.length)}
            testID="section-cancelled"
          >
            <View style={styles.list}>
              {groups.cancelled.map((step) => (
                <CompletedStepRow key={step.id} step={step} onOpen={() => open(step)} />
              ))}
            </View>
          </Section>
        ) : null}
        <AppText variant="caption" color="muted">
          {t("citizen:nextSteps.toChangeContact")}
        </AppText>
      </View>
    );
  }

  return (
    <Screen
      testID="next-steps-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      header={<WalletHeader title={t("citizen:nav.nextSteps")} />}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            accessibilityLabel={t("citizen:nextSteps.refreshHint")}
          />
        }
        testID="next-steps-scroll"
      >
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:nextSteps.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:nextSteps.title")}
          </AppText>
          <AppText color="muted">{t("citizen:nextSteps.subtitle")}</AppText>
        </View>
        <RepresentativeBanner patient={patient} />
        {body}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { gap: spacing.xs },
  sections: { gap: spacing.xl },
  list: { gap: spacing.md },
});
