/**
 * Next step detail route screen (CTZ-04). One mount = one `getInstruction` = one
 * `citizen.next_step.viewed`. Any id that is not an approved step of the active patient —
 * another patient's step, a withdrawn step, an unreleased (draft) referral, an unknown id —
 * renders the SAME `PermissionDenied` (the repository writes `access.denied`) with no partial
 * render, so a deep link never reveals whether the id exists.
 */
import { Button, ErrorState, LoadingState, PermissionDenied, Screen, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { useActivePatient } from "../health/useResults.ts";
import { InstructionDetail } from "./InstructionDetail.tsx";
import { nextStepErrorKind, useNextStep } from "./useNextSteps.ts";

export function NextStepDetailScreen({ instructionId }: { instructionId: string }) {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const step = useNextStep(patientId, instructionId);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/next-steps"));
  const backButton = (
    <Button variant="secondary" icon="chevron-left" onPress={back} testID="next-step-back">
      {t("citizen:nextSteps.detail.back")}
    </Button>
  );

  let body;
  const errorKind = step.isError ? nextStepErrorKind(step.error) : null;
  if (errorKind === "denied" || instructionId === "") {
    body = (
      <PermissionDenied
        title={t("citizen:nextSteps.detail.deniedTitle")}
        message={t("citizen:nextSteps.detail.denied")}
        action={backButton}
      />
    );
  } else if (errorKind === "other") {
    body = <ErrorState message={t("citizen:nextSteps.error")} onRetry={() => step.refetch()} />;
  } else if (step.data === undefined) {
    body = <LoadingState variant="skeleton" rows={1} label={t("citizen:nextSteps.loading")} />;
  } else {
    body = (
      <>
        <RepresentativeBanner patient={patient} />
        <InstructionDetail
          key={`${step.data.id}:${step.data.version}`}
          step={step.data}
          onReload={() => step.refetch()}
          onOpenSupport={() => router.push("/more")}
        />
      </>
    );
  }

  return (
    <Screen
      testID="next-step-detail-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:nextSteps.detail.title")} onBack={back} />}
    >
      {body}
    </Screen>
  );
}
