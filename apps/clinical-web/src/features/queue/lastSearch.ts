/**
 * The last review-queue URL search (`?tab=…&sort=…`), remembered per browser tab so CLN-07's
 * "Next pending case" / "Back to queue" follow the queue view the clinician came from.
 */
const LAST_QUEUE_SEARCH_KEY = "laif-clinical:last-queue-search";

export function rememberQueueSearch(search: string): void {
  try {
    window.sessionStorage.setItem(LAST_QUEUE_SEARCH_KEY, search);
  } catch {
    // ignore: convenience only
  }
}

export function lastQueueSearch(): string {
  try {
    return window.sessionStorage.getItem(LAST_QUEUE_SEARCH_KEY) ?? "";
  } catch {
    return "";
  }
}
