/**
 * Queue rows (CLN-05): accordion (one row open at a time; first row NOT auto-expanded), 25 per
 * page, "Showing 6 of 8" footer + pager.
 */
import type { PersonaId } from "@laif/domain";
import { Pagination, useTx } from "@laif/ui-web";
import { useState } from "react";

import { REVIEW_QUEUE_PAGE_SIZE } from "./model.ts";
import { QueueRow } from "./QueueRow.tsx";
import type { QueuePage } from "./useReviewQueue.ts";

export type QueueListProps = {
  data: QueuePage;
  page: number;
  personaId: PersonaId | null;
  onPageChange: (page: number) => void;
};

export function QueueList({ data, page, personaId, onPageChange }: QueueListProps) {
  const t = useTx();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ul
        aria-label={t("clinical:queue.listLabel")}
        className="m-0 space-y-1.5 p-0"
        data-testid="queue-list"
      >
        {data.items.map((item) => (
          <QueueRow
            key={item.review.id}
            item={item}
            nowIso={data.nowIso}
            personaId={personaId}
            expanded={openId === item.review.id}
            onExpandedChange={(open) => setOpenId(open ? item.review.id : null)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted m-0 text-xs" data-testid="queue-footer">
          {t("clinical:queue.footer.showing", { shown: data.items.length, count: data.total })}
        </p>
        {data.total > REVIEW_QUEUE_PAGE_SIZE ? (
          <Pagination
            page={page}
            pageSize={REVIEW_QUEUE_PAGE_SIZE}
            total={data.total}
            onPageChange={onPageChange}
          />
        ) : null}
      </div>
    </div>
  );
}
