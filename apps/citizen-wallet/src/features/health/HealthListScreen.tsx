/**
 * My health list (CTZ-03): greeting header, representative banner, the value-less pending
 * placeholder(s) pinned on top, released results newest first (order from the domain selector),
 * skeleton / empty / error + Retry states and pull-to-refresh. Logs `citizen.result.list_viewed`
 * once per focus. CTZ-04: the nearest upcoming approved next step sits above the results.
 */
import type { ReleasedObservation } from "@laif/domain";
import {
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  colors,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { usePersona } from "../../providers.tsx";
import { HomeNextStep } from "../next-steps/HomeNextStep.tsx";
import { firstNameOf } from "./copy.ts";
import { PendingReviewCard } from "./PendingReviewCard.tsx";
import { RepresentativeBanner } from "./RepresentativeBanner.tsx";
import { ResultCard } from "./ResultCard.tsx";
import {
  resultErrorKind,
  useActivePatient,
  useResults,
  useResultsListViewLog,
} from "./useResults.ts";

export function HealthListScreen() {
  const t = useTx();
  const router = useRouter();
  const persona = usePersona();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const results = useResults(patientId);
  const [refreshing, setRefreshing] = useState(false);
  useResultsListViewLog(patientId);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await results.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const open = (result: ReleasedObservation) =>
    router.push({ pathname: "/health/[observationId]", params: { observationId: result.id } });

  let body;
  if (results.isError && resultErrorKind(results.error) !== "consent") {
    body = (
      <ErrorState
        message={t("citizen:health.error")}
        onRetry={() => results.refetch()}
        {...(typeof (results.error as { code?: unknown }).code === "string"
          ? { code: (results.error as { code: string }).code }
          : {})}
      />
    );
  } else if (results.data === undefined) {
    body = <LoadingState variant="skeleton" rows={2} label={t("citizen:health.loading")} />;
  } else if (results.data.length === 0) {
    body = (
      <EmptyState
        icon="activity"
        title={t("citizen:health.empty.title")}
        description={t("citizen:health.empty.body")}
      />
    );
  } else {
    body = (
      <View
        style={styles.list}
        accessibilityRole="list"
        accessibilityLabel={t("citizen:health.listLabel")}
        testID="results-list"
      >
        {results.data.map((item) =>
          item.kind === "pending_review" ? (
            <PendingReviewCard key={item.id} item={item} />
          ) : (
            <ResultCard key={item.id} result={item} onPress={() => open(item)} />
          ),
        )}
      </View>
    );
  }

  return (
    <Screen
      testID="health-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      header={<WalletHeader title={t("citizen:nav.health")} />}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            accessibilityLabel={t("citizen:health.refreshHint")}
          />
        }
        testID="health-scroll"
      >
        <View style={styles.greeting}>
          <MicroLabel>{t("citizen:health.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:health.title", { firstName: firstNameOf(persona?.displayName ?? "") })}
          </AppText>
          <AppText color="muted">{t("citizen:health.subtitle")}</AppText>
        </View>
        <RepresentativeBanner patient={patient} />
        <HomeNextStep patientId={patientId} />
        {body}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  greeting: { gap: spacing.xs },
  list: { gap: spacing.md },
});
