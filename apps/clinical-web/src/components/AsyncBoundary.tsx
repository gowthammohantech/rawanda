/**
 * Clinical AsyncBoundary (CLN-11 task 1): the ONE place a clinical screen maps a query's
 * `{ status, data, error }` + the simulated Offline fault onto the ten UX states of spec §7.
 *
 * It wraps `@laif/ui-web`'s `AsyncBoundary` / `resolveUxState` (FND-09) instead of
 * re-implementing them; the kit renders initial / loading / empty / loaded / success /
 * validationError / conflict, and this wrapper swaps in the clinical variants of the states that
 * need clinical copy or context:
 *
 * | Situation                                   | UX state          | Rendered                         |
 * |---------------------------------------------|-------------------|----------------------------------|
 * | `enabled: false`                            | initial           | kit prompt / `initialFallback`   |
 * | pending                                     | loading           | kit skeleton (`aria-busy`)       |
 * | success, `isEmpty(data)`                    | empty             | `emptyFallback` / kit EmptyState |
 * | success                                     | loaded / success  | children (+ polite success line) |
 * | success or failed refetch while Offline     | offline           | "Last updated hh:mm" + children  |
 * | failed refetch (data kept), not offline     | loaded (stale)    | "Last updated hh:mm" + children  |
 * | error FORBIDDEN                             | permissionDenied  | `permissionFallback` (no data)   |
 * | error NOT_FOUND                             | empty (not found) | `notFoundFallback`               |
 * | error OFFLINE, nothing cached               | offline           | clinical `QueryErrorState`       |
 * | error CONFLICT                              | conflict          | `conflict` slot                  |
 * | error 500 / timeout / dependency            | serverError       | clinical `QueryErrorState`+retry |
 *
 * The page-level OfflineBanner lives in the shell (`ConnectionBanner`), so the offline state here
 * shows only the cached-data marker. Every render carries `data-ux-state` (state-matrix tests).
 */
import { formatTime, useLanguage } from "@laif/i18n";
import {
  AsyncBoundary as UiAsyncBoundary,
  EmptyState,
  Icon,
  LoadingSkeleton,
  PermissionDenied as UiPermissionDenied,
  resolveUxState,
  useTx,
  type LoadingSkeletonProps,
  type UxState,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import { useSimulatedOffline } from "../app/demo-tools.tsx";
import { toClinicalError } from "../data/errors.ts";
import { QueryErrorState } from "./QueryErrorState.tsx";

/** The slice of a TanStack `UseQueryResult` the boundary reads. */
export type BoundaryQuery<T> = {
  status: "pending" | "success" | "error";
  data: T | undefined;
  error: unknown;
  dataUpdatedAt: number;
  isFetching?: boolean;
  refetch: () => unknown;
};

export type BoundaryResolution = {
  state: UxState;
  /** Children are rendered with the (possibly cached) data. */
  showData: boolean;
  /** Data is a cached copy (offline or failed refetch): show "Last updated hh:mm". */
  stale: boolean;
  /** NOT_FOUND read: the `notFoundFallback` is shown. */
  notFound: boolean;
};

/** Pure state resolution (exported for the state-matrix tests). */
export function resolveBoundary<T>(
  query: BoundaryQuery<T>,
  options: {
    enabled?: boolean;
    offline?: boolean;
    isEmpty?: (data: T) => boolean;
    successMessage?: string | undefined;
  } = {},
): BoundaryResolution {
  const offline = options.offline === true;
  const none = { showData: false, stale: false, notFound: false };
  if (options.enabled === false) return { state: "initial", ...none };
  if (query.status === "pending") return { state: "loading", ...none };

  if (query.status === "error") {
    const code = toClinicalError(query.error).code;
    if (code === "FORBIDDEN") return { state: "permissionDenied", ...none };
    if (query.data !== undefined) {
      // A failed REFETCH keeps showing the last loaded data, labelled as such.
      const state: UxState = offline || code === "OFFLINE" ? "offline" : "loaded";
      return { state, showData: true, stale: true, notFound: false };
    }
    if (code === "NOT_FOUND") return { state: "empty", ...none, notFound: true };
    if (code === "OFFLINE") return { state: "offline", ...none };
    // The kit's mapping for the rest (CONFLICT → conflict, VALIDATION_ERROR, 5xx → serverError).
    return { state: resolveUxState({ status: "error", error: query.error }), ...none };
  }

  const data = query.data as T;
  const state = resolveUxState({
    status: "success",
    offline,
    isEmpty: options.isEmpty?.(data) ?? false,
    ...(options.successMessage === undefined ? {} : { successMessage: options.successMessage }),
  });
  if (state === "empty") return { state, ...none };
  return { state, showData: true, stale: state === "offline", notFound: false };
}

export type AsyncBoundaryProps<T> = {
  query: BoundaryQuery<T>;
  /** `false` → the initial state (nothing requested yet). */
  enabled?: boolean;
  /** Loaded but nothing to show. */
  isEmpty?: (data: T) => boolean;
  /** Translated accessible name of the loading region ("Loading the review queue"). */
  loadingLabel?: string;
  skeleton?: LoadingSkeletonProps["variant"];
  skeletonLines?: number;
  loadingFallback?: ReactNode;
  initialFallback?: ReactNode;
  emptyFallback?: ReactNode;
  /** FORBIDDEN (out-of-scope record): never shows any of the requested data. */
  permissionFallback?: ReactNode;
  /** NOT_FOUND (or a `null` record when `isEmpty` says so). */
  notFoundFallback?: ReactNode;
  /** CONFLICT on a read (rare): usually a `ConflictPanel`. */
  conflict?: ReactNode;
  /** Translated success line after a write (announced politely). */
  successMessage?: string;
  /** Overrides the stale label ("Last updated {{time}} — …"); receives the formatted time. */
  staleMessage?: (time: string) => string;
  /** `data-testid` prefix: `<id>-loading`, `<id>-stale`. */
  testId?: string;
  /**
   * Wraps every state that does NOT render the data (loading, errors, empty …) — e.g. a page
   * header that the loaded view renders itself.
   */
  wrapFallback?: (node: ReactNode) => ReactNode;
  /** Overrides the simulated Offline fault (tests / screens outside the demo provider). */
  offline?: boolean;
  children: (data: T) => ReactNode;
};

export function AsyncBoundary<T>(props: AsyncBoundaryProps<T>) {
  const t = useTx();
  const { language } = useLanguage();
  const simulatedOffline = useSimulatedOffline();
  const offline = props.offline ?? simulatedOffline;
  const { query } = props;
  const resolution = resolveBoundary(query, {
    offline,
    ...(props.enabled === undefined ? {} : { enabled: props.enabled }),
    ...(props.isEmpty === undefined ? {} : { isEmpty: props.isEmpty }),
    successMessage: props.successMessage,
  });
  const { state } = resolution;
  const retry = () => void query.refetch();
  const tid = (suffix: string) =>
    props.testId === undefined ? {} : { "data-testid": `${props.testId}-${suffix}` };
  const frame = (content: ReactNode) => (
    <div className="contents" data-ux-state={state}>
      {resolution.showData || props.wrapFallback === undefined
        ? content
        : props.wrapFallback(content)}
    </div>
  );

  if (resolution.showData) {
    const data = query.data as T;
    // A stale (cached) copy can itself be empty.
    const content =
      resolution.stale && props.isEmpty?.(data) === true
        ? (props.emptyFallback ?? <EmptyState />)
        : props.children(data);
    const time =
      query.dataUpdatedAt > 0
        ? formatTime(new Date(query.dataUpdatedAt).toISOString(), language)
        : null;
    const staleText =
      time === null
        ? t("common:state.cachedData")
        : (props.staleMessage?.(time) ??
          `${t("common:state.cachedData")} · ${t("common:state.lastUpdated", { time })}`);
    return frame(
      <>
        {resolution.stale ? (
          <p
            role="status"
            {...tid("stale")}
            className="border-risk-warning/25 bg-risk-warning-soft text-risk-warning mb-3 flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px]"
          >
            <Icon name="clock" size={14} />
            <span>{staleText}</span>
          </p>
        ) : null}
        {state === "success" ? (
          <UiAsyncBoundary status="success" successMessage={props.successMessage ?? ""}>
            {content}
          </UiAsyncBoundary>
        ) : (
          content
        )}
      </>,
    );
  }

  switch (state) {
    case "permissionDenied":
      return frame(props.permissionFallback ?? <UiPermissionDenied />);
    case "offline":
    case "serverError":
    case "validationError":
      return frame(<QueryErrorState error={query.error} onRetry={retry} />);
    case "conflict":
      return frame(props.conflict ?? <QueryErrorState error={query.error} onRetry={retry} />);
    case "empty":
      if (resolution.notFound) {
        return frame(
          props.notFoundFallback ?? <QueryErrorState error={query.error} onRetry={retry} />,
        );
      }
      return frame(
        <UiAsyncBoundary
          status="success"
          isEmpty
          {...(props.emptyFallback === undefined ? {} : { emptyFallback: props.emptyFallback })}
        >
          {null}
        </UiAsyncBoundary>,
      );
    case "loading":
      return frame(
        <div
          role="group"
          aria-busy="true"
          {...(props.loadingLabel === undefined ? {} : { "aria-label": props.loadingLabel })}
          {...tid("loading")}
        >
          {props.loadingFallback ?? (
            <LoadingSkeleton variant={props.skeleton ?? "card"} lines={props.skeletonLines ?? 3} />
          )}
        </div>,
      );
    default:
      // initial (and any future kit state): the kit's own rendering.
      return frame(
        <UiAsyncBoundary
          status="initial"
          {...(props.initialFallback === undefined
            ? {}
            : { initialFallback: props.initialFallback })}
        >
          {null}
        </UiAsyncBoundary>,
      );
  }
}

/**
 * Treats `query` as still loading until `ready` (e.g. the demo clock a screen also needs) —
 * errors pass through so a failure is never hidden behind a skeleton.
 */
export function whenReady<T>(query: BoundaryQuery<T>, ready: boolean): BoundaryQuery<T> {
  if (ready || query.status === "error") return query;
  return { ...query, status: "pending", data: undefined };
}
