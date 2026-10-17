/** Unfinished screening drafts (HWM-03): count + first 3 (`ListRow`), each opens the draft. */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, ListRow, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import type { DraftRow } from "../../data/drafts.ts";

export type DraftsPreviewProps = {
  count: number;
  drafts: readonly DraftRow[];
  onOpen: (draftId: string) => void;
};

export function DraftsPreview({ count, drafts, onOpen }: DraftsPreviewProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (count === 0) {
    return (
      <AppText color="muted" testID="drafts-none">
        {t("worker:home.drafts.none")}
      </AppText>
    );
  }
  return (
    <View style={styles.list} testID="drafts-preview">
      <AppText color="muted" testID="drafts-count">
        {t("worker:home.drafts.count", { count })}
      </AppText>
      {drafts.map(({ draft, patientName }) => (
        <ListRow
          key={draft.id}
          testID={`draft-row-${draft.id}`}
          icon="file"
          title={patientName === "" ? t("worker:home.row.unknownPatient") : patientName}
          subtitle={t("worker:home.drafts.savedAt", {
            time: formatDateTime(draft.updatedAt, language),
          })}
          accessibilityHint={t("worker:home.drafts.hint")}
          onPress={() => onOpen(draft.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
