/**
 * Patient record › Referrals & tasks tab (CLN-04 task 8): the merged `FollowUpTimeline`
 * (review decisions, referrals, follow-ups) with derived OVERDUE pills.
 */
import type { Patient } from "@laif/domain";
import { EmptyState, LoadingSkeleton, useTx } from "@laif/ui-web";

import { QueryErrorState } from "../../../components/QueryErrorState.tsx";
import { FollowUpTimeline } from "../../timeline/FollowUpTimeline.tsx";
import { usePatientTimeline } from "../../timeline/hooks.ts";

export function ReferralsTasksTab({ patient }: { patient: Patient }) {
  const t = useTx();
  const timeline = usePatientTimeline(patient.id);

  if (timeline.isPending) {
    return (
      <div aria-busy="true" aria-label={t("clinical:timeline.followUp.loading")}>
        <LoadingSkeleton lines={4} />
      </div>
    );
  }
  if (timeline.isError) {
    return <QueryErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />;
  }
  if (timeline.data.events.length === 0) {
    return <EmptyState icon="calendar" title={t("clinical:timeline.followUp.empty")} />;
  }
  return (
    <section aria-labelledby="followup-timeline-title" className="space-y-3">
      <h2
        id="followup-timeline-title"
        className="font-display text-ink m-0 text-base font-semibold"
      >
        {t("clinical:timeline.followUp.title")}
      </h2>
      <FollowUpTimeline events={timeline.data.events} />
    </section>
  );
}
