/**
 * Conflict resolution (HWM-09 task 7, WF-02 step 4, T-05). The callout says nothing has been
 * overwritten; the comparison shows your version against the latest; the worker must choose
 * explicitly and confirm (optional note). No server change happens before the confirmation:
 * the FND-07 resolution is local (one transaction, audited `sync.conflict_resolved` with the
 * original op id), then one `after_resolution` sync sends the decision.
 */
import type { ConflictResolution } from "@laif/domain";
import {
  Button,
  ConfirmSheet,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingState,
  Screen,
  spacing,
  TextField,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import type { ConflictData } from "../../data/syncCenter.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { platform } from "../../platform";
import { useRequiredScope } from "../../session/useScope.ts";
import { reapplyBlock } from "../../sync/resolve.ts";
import { ResolutionChoice } from "./ResolutionChoice.tsx";
import { useConflict, useResolveConflict } from "./useSyncCenter.ts";
import { VersionCompareTable } from "./VersionCompareTable.tsx";

export const RESOLUTION_NOTE_MAX = 500;

function ConflictBody({ data, onDone }: { data: ConflictData; onDone: () => void }) {
  const t = useTx();
  const { toast } = useToast();
  const { personaId } = useRequiredScope();
  const resolve = useResolveConflict();
  const [choice, setChoice] = useState<ConflictResolution | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // One idempotency key per decision on this screen: a double confirm replays.
  const [keys] = useState(() => {
    const ids = platform.createIds();
    return { reapply_on_latest: ids(), keep_latest: ids() };
  });
  const block = reapplyBlock(data.op, personaId);
  const waiting = data.op.status === "needs_resolution";

  const confirm = async () => {
    if (choice === null) return;
    setSaving(true);
    try {
      const trimmed = note.trim();
      await resolve(data.op, choice, keys[choice], trimmed === "" ? undefined : trimmed);
      toast({
        title:
          choice === "reapply_on_latest"
            ? t("worker:sync.conflict.doneReapply")
            : t("worker:sync.conflict.doneKeep"),
        tone: "positive",
      });
      setChoice(null);
      onDone();
    } catch {
      toast({ title: t("worker:sync.conflict.failed"), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const explain =
    data.op.entityType === "follow_up"
      ? t("worker:sync.conflict.explainTask")
      : t("worker:sync.conflict.explain");

  return (
    <>
      <InfoCallout icon="shield" testID="conflict-explain">
        {explain}
      </InfoCallout>
      <VersionCompareTable data={data} />
      {waiting ? (
        <ResolutionChoice
          reapplyBlock={block}
          disabled={saving}
          onChoose={(next) => {
            setNote("");
            setChoice(next);
          }}
        />
      ) : (
        <InfoCallout icon="info" testID="conflict-not-waiting">
          {t("worker:sync.conflict.notWaiting")}
        </InfoCallout>
      )}
      <ConfirmSheet
        testID="conflict-confirm"
        visible={choice !== null}
        onClose={() => {
          if (!saving) setChoice(null);
        }}
        title={
          choice === "keep_latest"
            ? t("worker:sync.conflict.confirmKeepTitle")
            : t("worker:sync.conflict.confirmReapplyTitle")
        }
        description={
          choice === "keep_latest"
            ? t("worker:sync.conflict.confirmKeepBody")
            : t("worker:sync.conflict.confirmReapplyBody")
        }
        confirmLabel={
          choice === "keep_latest"
            ? t("worker:sync.conflict.keepLatest")
            : t("worker:sync.conflict.reapply")
        }
        loading={saving}
        onConfirm={() => confirm()}
      >
        <TextField
          testID="conflict-note"
          label={t("worker:sync.conflict.note")}
          hint={t("worker:sync.conflict.noteHint")}
          value={note}
          onChangeText={setNote}
          maxLength={RESOLUTION_NOTE_MAX}
          multiline
          editable={!saving}
        />
      </ConfirmSheet>
    </>
  );
}

export function ConflictResolutionScreen({ opId }: { opId: string }) {
  const t = useTx();
  const router = useRouter();
  const { offline } = useNetwork();
  const conflict = useConflict(opId);
  const back = () => router.back();
  return (
    <Screen
      testID="conflict-screen"
      offline={offline}
      header={<AppHeader title={t("worker:sync.conflict.title")} onBack={back} />}
      contentStyle={styles.content}
    >
      {conflict.status === "error" ? (
        <ErrorState
          title={t("worker:sync.loadError")}
          {...(errorCodeOf(conflict.error) === undefined
            ? {}
            : { code: errorCodeOf(conflict.error) as string })}
          onRetry={() => conflict.refetch()}
        />
      ) : conflict.data === undefined ? (
        <LoadingState variant="skeleton" rows={3} label={t("worker:sync.loading")} />
      ) : conflict.data === null ? (
        <InfoCallout icon="info" testID="conflict-missing">
          {t("worker:sync.detail.notFound")}
        </InfoCallout>
      ) : (
        <>
          <ConflictBody data={conflict.data} onDone={back} />
          <View style={styles.footer}>
            <Button
              variant="ghost"
              size="sm"
              icon="file"
              testID="conflict-open-detail"
              onPress={() => router.push({ pathname: "/sync/[opId]", params: { opId } })}
            >
              {t("worker:sync.conflict.openDetail")}
            </Button>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  footer: { flexDirection: "row" },
});
