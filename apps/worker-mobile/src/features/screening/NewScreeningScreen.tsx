/**
 * `/screenings/new?patientId=` (HWM-05 task 1): re-checks the patient scope (out of scope →
 * `/denied`), then resumes the patient's most recent draft ("Resume draft from 09:12?" Resume /
 * Start new) or creates a new draft (`measuredAt` = demo now, UTC) and REPLACES to the form.
 * No patient → Find in picker mode. Creation is idempotent by the key made on mount.
 */
import { formatTime, useLanguage } from "@laif/i18n";
import type { Patient, Screening } from "@laif/domain";
import { Button, ErrorState, LoadingState, Screen, Sheet, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { AppHeader } from "../../components/AppHeader.tsx";
import * as patients from "../../data/patients.ts";
import { platform } from "../../platform";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { useDraftActions } from "./useScreeningDrafts.ts";

type Phase =
  { kind: "loading" } | { kind: "prompt"; patient: Patient; draft: Screening } | { kind: "error" };

export function NewScreeningScreen({ patientId }: { patientId: string }) {
  const t = useTx();
  const router = useRouter();
  const repo = useRepository();
  const { language } = useLanguage();
  const { facilityId } = useRequiredScope();
  const { latestForPatient, create } = useDraftActions();
  const [key] = useState(() => platform.createIds()());
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  const openDraft = (draftId: string) =>
    router.replace({ pathname: "/screenings/draft/[draftId]", params: { draftId } });

  const startNew = async () => {
    setPhase({ kind: "loading" });
    try {
      openDraft((await create(patientId, key)).id);
    } catch {
      setPhase({ kind: "error" });
    }
  };

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    if (patientId.trim() === "") {
      router.replace({ pathname: "/patients", params: { mode: "pick" } });
      return;
    }
    void (async () => {
      try {
        const access = await patients.get(repo, facilityId, patientId);
        if (access.status !== "ok") {
          router.replace({ pathname: "/denied", params: { reason: "patient" } });
          return;
        }
        const existing = await latestForPatient(patientId);
        if (existing !== null) {
          setPhase({ kind: "prompt", patient: access.patient, draft: existing });
          return;
        }
        openDraft((await create(patientId, key)).id);
      } catch {
        setPhase({ kind: "error" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per attempt
  }, [attempt]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/screen"));
  return (
    <Screen
      testID="screening-new-screen"
      header={<AppHeader title={t("worker:screening.title")} onBack={back} />}
    >
      {phase.kind === "error" ? (
        <ErrorState
          title={t("worker:screening.openFailed")}
          onRetry={() => {
            setPhase({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <LoadingState variant="skeleton" rows={3} label={t("worker:screening.opening")} />
      )}
      <Sheet
        visible={phase.kind === "prompt"}
        onClose={back}
        title={
          phase.kind === "prompt"
            ? t("worker:screening.resume.title", {
                time: formatTime(phase.draft.updatedAt, language),
              })
            : ""
        }
        {...(phase.kind === "prompt"
          ? {
              description: t("worker:screening.resume.description", {
                name: phase.patient.displayName,
              }),
            }
          : {})}
        testID="resume-prompt"
        footer={
          <>
            <Button
              fullWidth
              testID="resume-draft"
              onPress={() => {
                if (phase.kind === "prompt") openDraft(phase.draft.id);
              }}
            >
              {t("worker:screening.resume.resume")}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              testID="start-new-draft"
              onPress={() => void startNew()}
            >
              {t("worker:screening.resume.startNew")}
            </Button>
          </>
        }
      />
    </Screen>
  );
}
