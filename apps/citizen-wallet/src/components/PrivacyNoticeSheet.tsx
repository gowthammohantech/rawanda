/** Privacy notice (version `demo-notice-v0.1`) in a bottom sheet (CTZ-02 task 6). */
import { CITIZEN_NOTICE_VERSION } from "@laif/contracts";
import { AppText, Button, MicroLabel, Sheet, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function PrivacyNoticeSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const t = useTx();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("citizen:consent.noticeTitle")}
      testID="privacy-notice-sheet"
      footer={
        <Button variant="secondary" fullWidth onPress={onClose}>
          {t("citizen:consent.noticeClose")}
        </Button>
      }
    >
      <View style={styles.body}>
        <MicroLabel>
          {t("citizen:consent.noticeVersion", { version: CITIZEN_NOTICE_VERSION })}
        </MicroLabel>
        <AppText>{t("citizen:consent.noticeBody1")}</AppText>
        <AppText>{t("citizen:consent.noticeBody2")}</AppText>
        <AppText>{t("citizen:consent.noticeBody3")}</AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { gap: spacing.md } });
