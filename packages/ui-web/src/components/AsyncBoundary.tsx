import { isErrorCode, type ErrorCode } from "@laif/contracts";
import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ErrorState } from "./ErrorState.tsx";
import { LoadingSkeleton, type LoadingSkeletonProps } from "./LoadingSkeleton.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { PermissionDenied } from "./PermissionDenied.tsx";

/** The ten UX states of tech spec §7 / FND-09 §7. */
export const UX_STATES = [
  "initial",
  "loading",
  "loaded",
  "empty",
  "validationError",
  "serverError",
  "permissionDenied",
  "offline",
  "conflict",
  "success",
] as const;
export type UxState = (typeof UX_STATES)[number];

/** Same vocabulary as TanStack Query's `status` plus `initial` (nothing requested yet). */
export type AsyncStatus = "initial" | "pending" | "success" | "error";

export type AsyncBoundaryProps = {
  status: AsyncStatus;
  /** A `RepositoryError` (or anything with a `code`); its code picks the error state. */
  error?: unknown;
  /** Loaded but nothing to show. */
  isEmpty?: boolean;
  /** Device is offline (fault toggle / navigator.onLine). */
  offline?: boolean;
  /** Data shown is a cached copy (with `offline`): renders the cached-data marker. */
  hasCachedData?: boolean;
  /** Already formatted "hh:mm" of the cached data. */
  lastUpdatedLabel?: string;
  /** Translated success message (after a write); shown politely above the content. */
  successMessage?: string;
  onRetry?: () => unknown;
  onClearFilters?: () => void;
  /** Conflict UI (usually a `ConflictNotice`) rendered for `CONFLICT` errors. */
  conflict?: ReactNode;
  initialFallback?: ReactNode;
  loadingFallback?: ReactNode;
  skeleton?: LoadingSkeletonProps["variant"];
  emptyFallback?: ReactNode;
  children: ReactNode | (() => ReactNode);
};

/** Extracts an FND-03 `ErrorCode` from an unknown error (`RepositoryError.code`). */
export function errorCodeOf(error: unknown): ErrorCode | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (isErrorCode(code)) return code;
  }
  return error === undefined || error === null ? undefined : "INTERNAL";
}

/** Pure mapping from boundary props to one of the ten UX states. */
export function resolveUxState(
  props: Pick<AsyncBoundaryProps, "status" | "error" | "isEmpty" | "offline" | "successMessage">,
): UxState {
  if (props.status === "initial") return "initial";
  if (props.status === "pending") return props.offline === true ? "offline" : "loading";
  if (props.status === "error") {
    switch (errorCodeOf(props.error)) {
      case "FORBIDDEN":
        return "permissionDenied";
      case "VALIDATION_ERROR":
        return "validationError";
      case "CONFLICT":
        return "conflict";
      case "OFFLINE":
        return "offline";
      default:
        return "serverError";
    }
  }
  if (props.offline === true) return "offline";
  if (props.successMessage !== undefined) return "success";
  if (props.isEmpty === true) return "empty";
  return "loaded";
}

/**
 * Renders the right one of the ten UX states from `{ status, error }`:
 * initial → neutral prompt; loading → skeleton (`aria-busy`); loaded → children;
 * empty → EmptyState (+ clear filters); validationError → message + children (field errors
 * come from `Field`); serverError → ErrorState + retry + code; permissionDenied → no data;
 * offline → OfflineBanner + cached content marker; conflict → `conflict` slot; success → polite
 * message + children.
 */
export function AsyncBoundary(props: AsyncBoundaryProps) {
  const t = useTx();
  const state = resolveUxState(props);
  const render = () => (typeof props.children === "function" ? props.children() : props.children);
  const code = errorCodeOf(props.error);

  switch (state) {
    case "initial":
      return (
        <div data-ux-state={state}>
          {props.initialFallback ?? (
            <p className="border-border bg-surface text-muted rounded-lg border border-dashed px-6 py-8 text-center text-[13px]">
              {t("common:state.initial")}
            </p>
          )}
        </div>
      );
    case "loading":
      return (
        <div data-ux-state={state}>
          {props.loadingFallback ?? <LoadingSkeleton variant={props.skeleton ?? "card"} />}
        </div>
      );
    case "empty":
      return (
        <div data-ux-state={state}>
          {props.emptyFallback ?? (
            <EmptyState
              {...(props.onClearFilters === undefined
                ? {}
                : { onClearFilters: props.onClearFilters })}
            />
          )}
        </div>
      );
    case "permissionDenied":
      return (
        <div data-ux-state={state}>
          <PermissionDenied />
        </div>
      );
    case "serverError":
      return (
        <div data-ux-state={state}>
          <ErrorState
            {...(code === undefined ? {} : { code })}
            {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
          />
        </div>
      );
    case "validationError":
      return (
        <div data-ux-state={state} className="space-y-3">
          <p
            role="alert"
            className="bg-risk-danger-soft text-risk-danger flex items-center gap-2 rounded-md px-4 py-2 text-[13px]"
          >
            <Icon name="alert" size={16} />
            {t("common:state.validationError")}
          </p>
          {render()}
        </div>
      );
    case "conflict":
      return (
        <div data-ux-state={state} className="space-y-3">
          {props.conflict ?? (
            <ErrorState
              code="CONFLICT"
              {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
            />
          )}
        </div>
      );
    case "offline": {
      const showData = props.status === "success" || props.hasCachedData === true;
      return (
        <div data-ux-state={state} className="space-y-3">
          <OfflineBanner
            {...(props.lastUpdatedLabel === undefined
              ? {}
              : { lastSyncedLabel: props.lastUpdatedLabel })}
          />
          {showData ? (
            <>
              <p className="micro-label text-muted flex items-center gap-1.5">
                <Icon name="clock" size={12} />
                {props.lastUpdatedLabel === undefined
                  ? t("common:state.cachedData")
                  : `${t("common:state.cachedData")} · ${t("common:state.lastUpdated", { time: props.lastUpdatedLabel })}`}
              </p>
              {render()}
            </>
          ) : (
            <ErrorState
              code="OFFLINE"
              {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
            />
          )}
        </div>
      );
    }
    case "success":
      return (
        <div data-ux-state={state} className="space-y-3">
          <p
            role="status"
            className="bg-state-success-soft text-state-success flex items-center gap-2 rounded-md px-4 py-2 text-[13px]"
          >
            <Icon name="check" size={16} />
            {props.successMessage}
          </p>
          {render()}
        </div>
      );
    case "loaded":
      return <>{render()}</>;
  }
}
