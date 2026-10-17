/**
 * My health home card (CTZ-04): the nearest upcoming care-team-approved step as a "YOUR NEXT
 * STEP" card that opens it in Next steps. Renders nothing while loading, on error or when there
 * is no upcoming approved step (the results list stays the primary content).
 */
import { useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { NextStepCard } from "./NextStepCard.tsx";
import { nearestUpcoming, useNextSteps } from "./useNextSteps.ts";

export function HomeNextStep({ patientId }: { patientId: string | null }) {
  const t = useTx();
  const router = useRouter();
  const steps = useNextSteps(patientId);
  const step = nearestUpcoming(steps.data);
  if (step === null) return null;
  return (
    <NextStepCard
      step={step}
      testID="home-next-step"
      openLabel={t("citizen:nextSteps.home.open")}
      openHint={t("citizen:nextSteps.home.openHint")}
      onOpen={() =>
        router.push({
          pathname: "/next-steps/[instructionId]",
          params: { instructionId: step.id },
        })
      }
    />
  );
}
