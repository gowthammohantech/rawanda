/**
 * Queue tabs (CLN-05): `Tabs` (`role="tablist"`, arrow keys) — Pending N · Urgent N · Overdue N ·
 * Assigned to me N · All in scope N. Counts are `countReviews` over the SAME filter as the rows,
 * so a badge always equals the rows of its tab; `—` while loading.
 */
import { REVIEW_QUEUE_TABS, type ReviewQueueTab } from "@laif/domain";
import type { ReviewCounts } from "@laif/repositories";
import { Tabs, useTx, type TabItem } from "@laif/ui-web";
import type { ReactNode } from "react";

export type QueueTabsProps = {
  value: ReviewQueueTab;
  counts: ReviewCounts | undefined;
  onChange: (tab: ReviewQueueTab) => void;
  actions?: ReactNode;
  /** Panel of the active tab (`role="tabpanel"`, labelled by its tab). */
  children: ReactNode;
};

const isTab = (value: string): value is ReviewQueueTab =>
  (REVIEW_QUEUE_TABS as readonly string[]).includes(value);

export function QueueTabs({ value, counts, onChange, actions, children }: QueueTabsProps) {
  const t = useTx();
  const tabs: TabItem[] = REVIEW_QUEUE_TABS.map((tab) => ({
    value: tab,
    label: t(`clinical:queue.tabs.${tab}`),
    count: counts === undefined ? t("clinical:queue.tabs.countLoading") : counts[tab],
    ...(tab === value ? { content: children } : {}),
  }));
  return (
    <div data-testid="queue-tabs">
      <Tabs
        tabs={tabs}
        label={t("clinical:queue.tabs.label")}
        value={value}
        onValueChange={(next) => {
          if (isTab(next)) onChange(next);
        }}
        {...(actions === undefined ? {} : { actions })}
      />
    </div>
  );
}
