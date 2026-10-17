/** My correction requests (CTZ-07): newest first with status chips; "Ask for a correction". */
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { useCorrectionRequests, useCorrectionTargets } from "../../data/queries.ts";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { CorrectionRequestRow } from "./CorrectionRequestRow.tsx";

export function CorrectionListScreen() {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const requests = useCorrectionRequests(patientId);
  const targets = useCorrectionTargets(patientId);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more/privacy"));
  const ask = (
    <Button
      fullWidth
      icon="plus"
      onPress={() => router.push("/more/privacy/corrections/new")}
      testID="corrections-ask"
    >
      {t("citizen:correction.cta")}
    </Button>
  );

  let body;
  if (requests.isError && resultErrorKind(requests.error) === "consent") {
    body = <ConsentRequiredState />;
  } else if (requests.isError) {
    body = <ErrorState message={t("citizen:privacy.error")} onRetry={() => requests.refetch()} />;
  } else if (requests.data === undefined) {
    body = <LoadingState variant="skeleton" rows={3} label={t("citizen:privacy.loading")} />;
  } else if (requests.data.length === 0) {
    body = (
      <>
        <EmptyState icon="file" title={t("citizen:correction.list.empty")} />
        {ask}
      </>
    );
  } else {
    body = (
      <>
        {ask}
        <View style={styles.list} testID="corrections-list">
          {requests.data.map((r) => (
            <CorrectionRequestRow
              key={r.id}
              request={r}
              targets={targets.data}
              onPress={() =>
                router.push({
                  pathname: "/more/privacy/corrections/[requestId]",
                  params: { requestId: r.id },
                })
              }
            />
          ))}
        </View>
      </>
    );
  }

  return (
    <Screen
      testID="corrections-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:correction.list.title")} onBack={back} />}
    >
      <View style={styles.root}>
        <RepresentativeBanner patient={patient} />
        {body}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.lg }, list: { gap: spacing.sm } });
