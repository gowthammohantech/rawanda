/**
 * Result detail route screen (CTZ-03). One mount = one `getObservation` = one
 * `citizen.result.viewed`. A cross-patient id → `PermissionDenied` (the repository writes
 * `access.denied`) with NO partial render; a pending / unknown id → not-found state.
 */
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDenied,
  Screen,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { RepresentativeBanner } from "./RepresentativeBanner.tsx";
import { ResultDetail } from "./ResultDetail.tsx";
import {
  resultErrorKind,
  useActivePatient,
  useLinkedInstruction,
  useResult,
} from "./useResults.ts";

export function ResultDetailScreen({ observationId }: { observationId: string }) {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const result = useResult(patientId, observationId);
  const nextStep = useLinkedInstruction(patientId, result.data ?? null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/health"));
  const backButton = (
    <Button variant="secondary" icon="chevron-left" onPress={back} testID="result-back">
      {t("citizen:health.detail.back")}
    </Button>
  );

  let body;
  const errorKind = result.isError ? resultErrorKind(result.error) : null;
  if (errorKind === "denied") {
    body = (
      <PermissionDenied
        title={t("citizen:health.detail.deniedTitle")}
        message={t("citizen:health.detail.denied")}
        action={backButton}
      />
    );
  } else if (errorKind === "notFound") {
    body = (
      <EmptyState
        icon="file"
        title={t("citizen:health.detail.notFoundTitle")}
        description={t("citizen:health.detail.notFound")}
        action={backButton}
      />
    );
  } else if (errorKind === "other") {
    body = <ErrorState message={t("citizen:health.error")} onRetry={() => result.refetch()} />;
  } else if (result.data === undefined || !nextStep.settled) {
    body = <LoadingState label={t("citizen:health.loading")} />;
  } else {
    body = (
      <>
        <RepresentativeBanner patient={patient} />
        <ResultDetail
          result={result.data}
          hasNextStep={nextStep.instruction !== null}
          onOpenNextSteps={() => router.push("/next-steps")}
          onOpenSupport={() => router.push("/more")}
        />
      </>
    );
  }

  return (
    <Screen
      testID="result-detail-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:health.detail.title")} onBack={back} />}
    >
      {body}
    </Screen>
  );
}
