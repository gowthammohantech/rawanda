/**
 * Queue toolbar (CLN-05): search within the queue (debounced; the URL is replaced while typing),
 * facility select (the persona's permitted facilities only — choosing one switches the active
 * facility, as on the patient search), assignee (`Anyone / Me / Unassigned`) and sort.
 */
import {
  REVIEW_QUEUE_ASSIGNEES,
  REVIEW_QUEUE_MAX_QUERY,
  type ReviewQueueAssignee,
} from "@laif/contracts";
import { REVIEW_QUEUE_SORTS, type ReviewQueueSort } from "@laif/domain";
import { SearchInput, Select, useTx, type SelectOption } from "@laif/ui-web";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "../patients/hooks.ts";

export type QueueToolbarProps = {
  q: string;
  /** `location.key` of the current URL. */
  navigationKey: string;
  /** True when the current URL was written by the search box itself. */
  fromSearchBox: boolean;
  facilityId: string;
  facilityOptions: readonly SelectOption[];
  assignee: ReviewQueueAssignee;
  sort: ReviewQueueSort;
  onQueryChange: (q: string) => void;
  onFacilityChange: (facilityId: string) => void;
  onAssigneeChange: (assignee: ReviewQueueAssignee) => void;
  onSortChange: (sort: ReviewQueueSort) => void;
};

const isAssignee = (v: string): v is ReviewQueueAssignee =>
  (REVIEW_QUEUE_ASSIGNEES as readonly string[]).includes(v);
const isSort = (v: string): v is ReviewQueueSort =>
  (REVIEW_QUEUE_SORTS as readonly string[]).includes(v);

export function QueueToolbar({
  q,
  navigationKey,
  fromSearchBox,
  facilityId,
  facilityOptions,
  assignee,
  sort,
  onQueryChange,
  onFacilityChange,
  onAssigneeChange,
  onSortChange,
}: QueueToolbarProps) {
  const t = useTx();
  const [text, setText] = useState(q);
  const [seenNavigation, setSeenNavigation] = useState(navigationKey);
  // URL → box for navigations the box did not make (back / forward, clear filters). Derived
  // during render (no effect), so a late echo of our own debounced write never overwrites typing.
  if (navigationKey !== seenNavigation) {
    setSeenNavigation(navigationKey);
    if (!fromSearchBox) setText(q);
  }
  const debounced = useDebouncedValue(text);
  const lastSent = useRef(q);
  useEffect(() => {
    if (!fromSearchBox) lastSent.current = q;
  }, [q, fromSearchBox, navigationKey]);

  // Box → URL, once typing settles.
  useEffect(() => {
    const next = debounced.trim();
    if (next === lastSent.current.trim()) return;
    lastSent.current = next;
    onQueryChange(next);
  }, [debounced, onQueryChange]);

  return (
    <div
      role="group"
      aria-label={t("clinical:queue.filters.label")}
      data-testid="queue-toolbar"
      className="grid gap-3 md:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(9rem,1fr))] md:items-end"
    >
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-ink text-sm font-semibold">
          {t("clinical:queue.filters.search")}
        </span>
        <SearchInput
          label={t("clinical:queue.filters.search")}
          placeholder={t("clinical:queue.filters.searchPlaceholder")}
          value={text}
          maxLength={REVIEW_QUEUE_MAX_QUERY}
          onValueChange={setText}
          data-testid="queue-search"
        />
      </div>
      <Select
        label={t("clinical:queue.filters.facility")}
        options={facilityOptions}
        value={facilityId}
        onChange={(event) => onFacilityChange(event.target.value)}
        data-testid="queue-facility"
      />
      <Select
        label={t("clinical:queue.filters.assignee.label")}
        options={REVIEW_QUEUE_ASSIGNEES.map((value) => ({
          value,
          label: t(`clinical:queue.filters.assignee.${value}`),
        }))}
        value={assignee}
        onChange={(event) => {
          if (isAssignee(event.target.value)) onAssigneeChange(event.target.value);
        }}
        data-testid="queue-assignee"
      />
      <Select
        label={t("clinical:queue.filters.sort.label")}
        options={REVIEW_QUEUE_SORTS.map((value) => ({
          value,
          label: t(`clinical:queue.filters.sort.${value}`),
        }))}
        value={sort}
        onChange={(event) => {
          if (isSort(event.target.value)) onSortChange(event.target.value);
        }}
        data-testid="queue-sort"
      />
    </div>
  );
}
