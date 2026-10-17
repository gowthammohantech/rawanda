/**
 * Shared shell of the HWM-08 forms: loads the task as opened (scope re-checked; another worker's
 * or facility's task → `/denied?reason=task`, audited, nothing rendered), shows loading / read
 * failure states, and hands the ready task + demo now to the form. Also the small banners the
 * forms share (error summary, failure / block messages).
 */
import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import {
  AppText,
  colors,
  ErrorState,
  errorCodeOf,
  Icon,
  LoadingState,
  radii,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import type { TaskDetail } from "../../data/followUps.ts";
import { useSyncStatus } from "../../data/hooks/useSyncStatus.ts";
import { useDemoNow } from "../patients/usePatients.ts";
import { useFollowUpForForm } from "./useFollowUpForms.ts";

export type FormContext = {
  detail: TaskDetail;
  now: Date;
  header: ReactNode;
  offline: boolean;
  /** Back to the task detail. */
  back: () => void;
};

export function FollowUpFormFrame({
  followUpId,
  title,
  testID,
  children,
}: {
  followUpId: string;
  title: string;
  testID: string;
  children: (ctx: FormContext) => ReactNode;
}) {
  const t = useTx();
  const router = useRouter();
  const sync = useSyncStatus();
  const query = useFollowUpForForm(followUpId);
  const now = useDemoNow();
  const denied = query.data?.status === "denied";

  useEffect(() => {
    if (denied) router.replace({ pathname: "/denied", params: { reason: "task" } });
  }, [denied, router]);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: "/tasks/[followUpId]", params: { followUpId } });
  const header = <AppHeader title={title} onBack={back} />;

  if (query.isError) {
    const code = errorCodeOf(query.error);
    return (
      <Screen testID={`${testID}-error`} header={header} offline={sync.offline}>
        <ErrorState
          title={t("worker:tasks.detail.error")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => query.refetch()}
        />
      </Screen>
    );
  }
  if (query.data?.status !== "ok" || now === null) {
    return (
      <Screen testID={`${testID}-loading`} header={header} offline={sync.offline}>
        <LoadingState variant="skeleton" rows={3} label={t("worker:tasks.detail.loading")} />
      </Screen>
    );
  }
  return <>{children({ detail: query.data.detail, now, header, offline: sync.offline, back })}</>;
}

/** Danger banner (failures, blocks, error summary title). */
export function FormBanner({
  testID,
  tone = "danger",
  children,
}: {
  testID: string;
  tone?: "danger" | "info";
  children: ReactNode;
}) {
  const color = tone === "danger" ? colors.danger : colors.info;
  return (
    <View
      style={[styles.banner, tone === "danger" ? styles.danger : styles.info]}
      testID={testID}
      accessibilityLiveRegion="polite"
      aria-live="polite"
    >
      <Icon name={tone === "danger" ? "alert" : "info"} size={18} color={color} />
      <View style={styles.flex}>
        {typeof children === "string" ? (
          <AppText weight="semibold" colorValue={color}>
            {children}
          </AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** "Check the highlighted fields" + one line per field error (re-translated on EN⇄RW). */
export function ErrorSummary({ errors }: { errors: readonly FieldErrorLike[] }) {
  const t = useTx();
  if (errors.length === 0) return null;
  return (
    <FormBanner testID="form-error-summary">
      <AppText weight="semibold" colorValue={colors.danger}>
        {t("worker:followup.errors.summary")}
      </AppText>
      {errors.map((error, index) => (
        <SummaryLine key={index} error={error} />
      ))}
    </FormBanner>
  );
}

function SummaryLine({ error }: { error: FieldErrorLike }) {
  const text = useFieldErrorText(error);
  return text === undefined ? null : (
    <AppText variant="caption" colorValue={colors.danger}>
      {`• ${text}`}
    </AppText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: spacing.xs },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  danger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  info: { borderColor: colors.info, backgroundColor: colors.infoSoft },
});
