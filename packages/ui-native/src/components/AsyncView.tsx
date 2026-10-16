import { isErrorCode, type ErrorCode } from "@laif/contracts";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { announce } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ErrorState } from "./ErrorState.tsx";
import { LoadingState } from "./LoadingState.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { PermissionDenied } from "./PermissionDenied.tsx";

/** The ten UX states of tech spec §7 — same contract as ui-web `AsyncBoundary`. */
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

/** TanStack Query `status` vocabulary plus `initial` (nothing requested yet). */
export type AsyncStatus = "initial" | "pending" | "success" | "error";

export type AsyncViewProps = {
  status: AsyncStatus;
  /** A `RepositoryError` (or anything with a `code`). */
  error?: unknown;
  isEmpty?: boolean;
  /** Device offline (fault toggle). */
  offline?: boolean;
  /** Cached copy is being shown (with `offline`). */
  hasCachedData?: boolean;
  /** Already formatted "hh:mm" of the cached data. */
  lastUpdatedLabel?: string;
  /** Translated success message (after a write); announced to screen readers. */
  successMessage?: string;
  onRetry?: () => unknown;
  onClearFilters?: () => void;
  /** Conflict UI (usually a `ConflictCard`) for `CONFLICT` errors. */
  conflict?: ReactNode;
  initialFallback?: ReactNode;
  loadingFallback?: ReactNode;
  /** Skeleton cards instead of a spinner while loading. */
  skeleton?: boolean;
  emptyFallback?: ReactNode;
  children: ReactNode | (() => ReactNode);
};

/** Extracts an FND-03 `ErrorCode` from an unknown error. */
export function errorCodeOf(error: unknown): ErrorCode | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (isErrorCode(code)) return code;
  }
  return error === undefined || error === null ? undefined : "INTERNAL";
}

/** Pure mapping from props to one of the ten UX states (identical to ui-web). */
export function resolveUxState(
  props: Pick<AsyncViewProps, "status" | "error" | "isEmpty" | "offline" | "successMessage">,
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

function Notice({
  tone,
  icon,
  text,
  live,
}: {
  tone: "danger" | "positive";
  icon: "alert" | "check";
  text: string;
  live: "alert" | "polite";
}) {
  const fg = tone === "danger" ? colors.danger : colors.positive;
  const bg = tone === "danger" ? colors.dangerSoft : colors.positiveSoft;
  return (
    <View
      accessible
      accessibilityRole={live === "alert" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[styles.notice, { backgroundColor: bg }]}
    >
      <Icon name={icon} size={16} color={fg} />
      <AppText variant="caption" colorValue={fg} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

/** Renders the right one of the ten UX states from `{ status, error }` (see ui-web AsyncBoundary). */
export function AsyncView(props: AsyncViewProps) {
  const t = useTx();
  const state = resolveUxState(props);
  const render = () => (typeof props.children === "function" ? props.children() : props.children);
  const code = errorCodeOf(props.error);
  const success = state === "success" ? props.successMessage : undefined;

  useEffect(() => {
    if (success !== undefined) announce(success);
  }, [success]);

  switch (state) {
    case "initial":
      return (
        <View testID="ux-initial">
          {props.initialFallback ?? (
            <View style={styles.initial}>
              <AppText color="muted" align="center">
                {t("common:state.initial")}
              </AppText>
            </View>
          )}
        </View>
      );
    case "loading":
      return (
        <View testID="ux-loading">
          {props.loadingFallback ?? (
            <LoadingState variant={props.skeleton === true ? "skeleton" : "spinner"} />
          )}
        </View>
      );
    case "empty":
      return (
        <View testID="ux-empty">
          {props.emptyFallback ?? (
            <EmptyState
              {...(props.onClearFilters === undefined
                ? {}
                : { onClearFilters: props.onClearFilters })}
            />
          )}
        </View>
      );
    case "permissionDenied":
      return (
        <View testID="ux-permissionDenied">
          <PermissionDenied />
        </View>
      );
    case "serverError":
      return (
        <View testID="ux-serverError">
          <ErrorState
            {...(code === undefined ? {} : { code })}
            {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
          />
        </View>
      );
    case "validationError":
      return (
        <View testID="ux-validationError" style={styles.stack}>
          <Notice
            tone="danger"
            icon="alert"
            text={t("common:state.validationError")}
            live="alert"
          />
          {render()}
        </View>
      );
    case "conflict":
      return (
        <View testID="ux-conflict" style={styles.stack}>
          {props.conflict ?? (
            <ErrorState
              code="CONFLICT"
              {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
            />
          )}
        </View>
      );
    case "offline": {
      const showData = props.status === "success" || props.hasCachedData === true;
      return (
        <View testID="ux-offline" style={styles.stack}>
          <OfflineBanner
            {...(props.lastUpdatedLabel === undefined
              ? {}
              : { lastSyncedLabel: props.lastUpdatedLabel })}
          />
          {showData ? (
            <>
              <View style={styles.cached}>
                <Icon name="clock" size={12} color={colors.muted} />
                <AppText variant="micro" color="muted">
                  {props.lastUpdatedLabel === undefined
                    ? t("common:state.cachedData")
                    : `${t("common:state.cachedData")} · ${t("common:state.lastUpdated", { time: props.lastUpdatedLabel })}`}
                </AppText>
              </View>
              {render()}
            </>
          ) : (
            <ErrorState
              code="OFFLINE"
              {...(props.onRetry === undefined ? {} : { onRetry: props.onRetry })}
            />
          )}
        </View>
      );
    }
    case "success":
      return (
        <View testID="ux-success" style={styles.stack}>
          <Notice
            tone="positive"
            icon="check"
            text={props.successMessage ?? t("common:state.success")}
            live="polite"
          />
          {render()}
        </View>
      );
    case "loaded":
      return <>{render()}</>;
  }
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  flex: { flex: 1 },
  initial: {
    padding: spacing.xxl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  cached: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
