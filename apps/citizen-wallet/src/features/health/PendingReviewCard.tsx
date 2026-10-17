/**
 * A recent check still waiting for the care team (CTZ-03 task 3). Takes ONLY the placeholder —
 * which carries no readings, flags or reason codes — and shows no values and no urgency.
 */
import type { PendingReviewPlaceholder } from "@laif/domain";
import { AppText, Card, StatusChip, useTx } from "@laif/ui-native";

export function PendingReviewCard({ item }: { item: PendingReviewPlaceholder }) {
  const t = useTx();
  return (
    <Card variant="muted" testID={`pending-card-${item.id}`}>
      <StatusChip tone="neutral" icon="clock">
        {t("citizen:health.pending.title")}
      </StatusChip>
      <AppText>
        {`${t("citizen:health.pending.body")} ${t("citizen:health.pending.after")}`}
      </AppText>
    </Card>
  );
}
