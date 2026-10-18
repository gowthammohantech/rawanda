/**
 * Settings › Scenario actions (CLN-02 task 6). A snapshot of the scenario baseline read through
 * the (fault-wrapped) repository — pending reviews and the WF-02 follow-up version — and
 * "Simulate worker updating follow-up (WF-02)": `repository.demo.simulateExternalUpdate()` saves a
 * new version of SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT as `persona-chw-alpha1-a (simulated)`, which
 * appends `demo.concurrent_update_simulated` attributed to that simulated actor (CLN-09: status
 * `contacted`, a worker note and a later due date). The next save
 * of the follow-up from the portal (CLN-09) then gets `CONFLICT` with `latest`.
 */
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import {
  Button,
  Card,
  KeyValueList,
  LoadingSkeleton,
  StatusChip,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { clinicalKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { demoNowIso } from "../patients/hooks.ts";

const WF02 = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Synthetic record content written by the simulated worker (data, not UI copy). */
export const SIMULATED_NOTE = "Visited the household; patient will attend on Friday (simulated).";

export function ScenarioCard() {
  const t = useTx();
  const repo = useRepository();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  const [busy, setBusy] = useState(false);

  const counts = useQuery({
    queryKey: clinicalKeys.reviewCounts(fac, { settings: "snapshot" }),
    queryFn: () => repo.countReviews(),
  });
  const wf02InFacility = activeFacilityId === WF02.facilityId;
  const followUp = useQuery({
    queryKey: clinicalKeys.followUps(fac, { patientId: WF02.patientId }),
    queryFn: () => repo.listFollowUps({ patientId: WF02.patientId }),
    select: (page) => page.items.find((item) => item.id === WF02.followUpId) ?? null,
    enabled: wf02InFacility,
  });

  const simulate = async () => {
    const current = followUp.data;
    if (current === null || current === undefined) return;
    setBusy(true);
    try {
      const nowIso = await demoNowIso(repo);
      // CLN-09 task 5: the simulated worker records the visit (status `contacted`), adds a note
      // and moves the due date — a later portal save on the old version must then conflict.
      const result = await repo.demo.simulateExternalUpdate(
        "followUp",
        WF02.followUpId,
        {
          status: "contacted",
          dueAt: new Date(Date.parse(current.dueAt) + DAY_MS).toISOString(),
          notes: [
            ...current.notes,
            { at: nowIso, by: PERSONA_IDS.chwAlpha1A, text: SIMULATED_NOTE },
          ],
        },
        PERSONA_IDS.chwAlpha1A,
      );
      await queryClient.invalidateQueries({ queryKey: clinicalKeys.all(fac) });
      toast({
        title: t("clinical:settings.scenario.simulatedDone", { version: result.version }),
        tone: "positive",
      });
    } catch {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const loading = counts.isPending || (wf02InFacility && followUp.isPending);
  const error = counts.error ?? (wf02InFacility ? followUp.error : null);

  return (
    <Card title={t("clinical:settings.scenario.title")}>
      <div className="space-y-4">
        <p className="text-muted text-sm">{t("clinical:settings.scenario.body")}</p>
        {error !== null ? (
          <QueryErrorState
            error={error}
            onRetry={() =>
              Promise.all([counts.refetch(), wf02InFacility ? followUp.refetch() : null])
            }
          />
        ) : loading ? (
          <LoadingSkeleton lines={2} />
        ) : (
          <section aria-label={t("clinical:settings.scenario.snapshot")}>
            <KeyValueList
              items={[
                {
                  label: t("clinical:settings.scenario.pendingReviews"),
                  value: (
                    <span data-testid="snapshot-pending-reviews">{counts.data?.pending ?? 0}</span>
                  ),
                },
                ...(wf02InFacility && followUp.data
                  ? [
                      {
                        label: t("clinical:settings.scenario.wf02Version"),
                        value: (
                          <span data-testid="snapshot-wf02-version">{followUp.data.version}</span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </section>
        )}
        {wf02InFacility ? null : (
          <p className="text-muted text-xs">{t("clinical:settings.scenario.wf02Missing")}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon="refresh"
            loading={busy}
            disabled={!wf02InFacility || followUp.data === null || followUp.data === undefined}
            onClick={() => void simulate()}
            aria-describedby="wf02-hint"
          >
            {t("clinical:settings.scenario.simulateWf02")}
          </Button>
          <StatusChip tone="info" icon="user">
            {t("clinical:settings.scenario.simulatedActor")}
          </StatusChip>
        </div>
        <p id="wf02-hint" className="text-muted text-xs">
          {t("clinical:settings.scenario.simulateWf02Hint")}
        </p>
      </div>
    </Card>
  );
}
