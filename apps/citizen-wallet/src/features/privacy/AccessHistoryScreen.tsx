/**
 * Who has looked at my record (CTZ-07 task 4): synthetic staff reads from the seed plus the
 * citizen's own views (CTZ-03…06), newest first, with All / Care team / Me chips. Staff are
 * shown by role and facility only. One `citizen.access_history.viewed` per focus.
 */
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  colors,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { useAccessEvents } from "../../data/queries.ts";
import { usePersona } from "../../providers.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { AccessEventRow } from "./AccessEventRow.tsx";
import { AccessHistoryFilter } from "./AccessHistoryFilter.tsx";
import { accessCounts, matchesAccessFilter, type AccessFilter } from "./copy.ts";
import { useAccessHistoryViewLog } from "./usePrivacy.ts";

export function AccessHistoryScreen() {
  const t = useTx();
  const router = useRouter();
  const persona = usePersona();
  const personaId = persona?.id ?? null;
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const events = useAccessEvents(patientId);
  const [filter, setFilter] = useState<AccessFilter>("all");
  useAccessHistoryViewLog(patientId);

  const all = events.data;
  const counts = useMemo(() => accessCounts(all ?? [], personaId), [all, personaId]);
  const shown = useMemo(
    () => (all ?? []).filter((e) => matchesAccessFilter(e, filter, personaId)),
    [all, filter, personaId],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more/privacy"));

  let body;
  if (events.isError && resultErrorKind(events.error) === "consent") {
    body = <ConsentRequiredState />;
  } else if (events.isError) {
    body = <ErrorState message={t("citizen:privacy.error")} onRetry={() => events.refetch()} />;
  } else if (all === undefined) {
    body = <LoadingState variant="skeleton" rows={4} label={t("citizen:privacy.loading")} />;
  } else if (all.length === 0) {
    body = <EmptyState icon="eye" title={t("citizen:privacy.access.empty")} />;
  } else {
    body = (
      <>
        <AccessHistoryFilter value={filter} counts={counts} onChange={setFilter} />
        {shown.length === 0 ? (
          <EmptyState
            icon="filter"
            title={t("citizen:privacy.access.filterEmpty")}
            action={
              <Button variant="secondary" onPress={() => setFilter("all")} testID="access-show-all">
                {t("citizen:privacy.access.showAll")}
              </Button>
            }
          />
        ) : (
          <Card variant="default" testID="access-list">
            <View accessibilityLabel={t("citizen:privacy.access.listLabel")}>
              {shown.map((event, index) => (
                <View key={event.id} style={index > 0 ? styles.divider : null}>
                  <AccessEventRow
                    event={event}
                    personaId={personaId}
                    ownName={persona?.displayName ?? ""}
                    patientName={patient?.displayName ?? ""}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}
      </>
    );
  }

  return (
    <Screen
      testID="access-history-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:privacy.access.title")} onBack={back} />}
    >
      <View style={styles.root}>
        <AppText color="muted">{t("citizen:privacy.access.intro")}</AppText>
        <RepresentativeBanner patient={patient} />
        {body}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft },
});
