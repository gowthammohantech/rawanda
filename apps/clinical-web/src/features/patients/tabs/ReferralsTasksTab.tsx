/**
 * Patient record › Referrals & tasks tab (CLN-04 task 8): the merged `FollowUpTimeline`
 * (review decisions, referrals, follow-ups) with derived OVERDUE pills. CLN-08: referral events
 * open the referral drawer, and "Create referral" (`referral.manage`) opens the create dialog
 * limited to this patient's decided reviews without an open referral.
 */
import type { Patient } from "@laif/domain";
import { Button, EmptyState, LoadingSkeleton, useTx } from "@laif/ui-web";
import { useState } from "react";
import { useNavigate } from "react-router";

import { useDemoTools } from "../../../app/demo-tools.tsx";
import { routes } from "../../../app/routes.ts";
import { QueryErrorState } from "../../../components/QueryErrorState.tsx";
import { useSession } from "../../../session/useSession.ts";
import { useDemoNow } from "../../decision/hooks.ts";
import { CreateReferralDialog } from "../../referrals/CreateReferralDialog.tsx";
import { FollowUpTimeline } from "../../timeline/FollowUpTimeline.tsx";
import { usePatientTimeline } from "../../timeline/hooks.ts";

export function ReferralsTasksTab({ patient }: { patient: Patient }) {
  const t = useTx();
  const timeline = usePatientTimeline(patient.id);
  const { can } = useSession();
  const { faultConfig } = useDemoTools();
  const now = useDemoNow();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const createButton =
    can("referral.manage") && now.data !== undefined ? (
      <Button
        variant="secondary"
        size="sm"
        icon="plus"
        disabled={faultConfig.offline}
        data-testid="patient-create-referral"
        onClick={() => setCreating(true)}
      >
        {t("clinical:referrals.actions.create")}
      </Button>
    ) : null;
  const dialog =
    creating && now.data !== undefined ? (
      <CreateReferralDialog
        open
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        nowIso={now.data}
        patientId={patient.id}
        onSaved={(referral) => void navigate(routes.referrals({ id: referral.id }))}
      />
    ) : null;

  if (timeline.isPending) {
    return (
      <div role="group" aria-busy="true" aria-label={t("clinical:timeline.followUp.loading")}>
        <LoadingSkeleton lines={4} />
      </div>
    );
  }
  if (timeline.isError) {
    return <QueryErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />;
  }
  return (
    <section aria-labelledby="followup-timeline-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="followup-timeline-title"
          className="font-display text-ink m-0 text-base font-semibold"
        >
          {t("clinical:timeline.followUp.title")}
        </h2>
        {createButton}
      </div>
      {timeline.data.events.length === 0 ? (
        <EmptyState icon="calendar" title={t("clinical:timeline.followUp.empty")} />
      ) : (
        <FollowUpTimeline events={timeline.data.events} canOpenReferral={can("referral.manage")} />
      )}
      {dialog}
    </section>
  );
}
