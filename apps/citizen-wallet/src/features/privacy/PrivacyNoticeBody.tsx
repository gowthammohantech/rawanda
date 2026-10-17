/**
 * Privacy notice body (CTZ-07 task 3), version `demo-notice-v0.1`, headed "DEMO NOTICE — NOT
 * APPROVED WORDING": what is shown, who sees it, where it is stored, how long it is kept, your
 * choices and your rights under Rwanda Law No. 058/2021 (access, correction, portability,
 * erasure — each "process to be defined by the Ministry; not available in this demo").
 * Coverage: LAIF MoH proposal p. 12. All keys are flagged for legal + linguistic review.
 */
import { CITIZEN_NOTICE_VERSION } from "@laif/contracts";
import {
  AppText,
  Button,
  Card,
  Icon,
  MicroLabel,
  Section,
  colors,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

const SECTIONS = [
  {
    id: "shown",
    title: "citizen:privacy.notice.shownTitle",
    body: "citizen:privacy.notice.shownBody",
  },
  { id: "who", title: "citizen:privacy.notice.whoTitle", body: "citizen:privacy.notice.whoBody" },
  {
    id: "stored",
    title: "citizen:privacy.notice.storedTitle",
    body: "citizen:privacy.notice.storedBody",
  },
  {
    id: "kept",
    title: "citizen:privacy.notice.keptTitle",
    body: "citizen:privacy.notice.keptBody",
  },
  {
    id: "choices",
    title: "citizen:privacy.notice.choicesTitle",
    body: "citizen:privacy.notice.choicesBody",
  },
] as const satisfies readonly { id: string; title: TranslationKey; body: TranslationKey }[];

export const NOTICE_RIGHTS = ["access", "correction", "portability", "erasure"] as const;

export type PrivacyNoticeBodyProps = {
  onOpenConsent: () => void;
  onAskCorrection: () => void;
};

export function PrivacyNoticeBody({ onOpenConsent, onAskCorrection }: PrivacyNoticeBodyProps) {
  const t = useTx();
  return (
    <View style={styles.root} testID="privacy-notice-body">
      <View style={styles.head}>
        <MicroLabel testID="notice-heading">{t("citizen:privacy.notice.heading")}</MicroLabel>
        <AppText variant="caption" color="muted" testID="notice-version">
          {t("citizen:privacy.notice.version", { version: CITIZEN_NOTICE_VERSION })}
        </AppText>
      </View>
      {SECTIONS.map((section) => (
        <Section key={section.id} title={t(section.title)} testID={`notice-${section.id}`}>
          <AppText>{t(section.body)}</AppText>
        </Section>
      ))}
      <Card title={t("citizen:privacy.notice.rightsTitle")} testID="notice-rights">
        <AppText>{t("citizen:privacy.notice.rightsIntro")}</AppText>
        {NOTICE_RIGHTS.map((right) => (
          <View key={right} style={styles.right} testID={`notice-right-${right}`}>
            <Icon name="lock" size={16} color={colors.muted} />
            <View style={styles.rightText}>
              <AppText weight="semibold">
                {t(`citizen:privacy.notice.rights.${right}` as TranslationKey)}
              </AppText>
              <AppText variant="caption" color="muted">
                {t("citizen:privacy.notice.rightNotAvailable")}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
      <View style={styles.actions}>
        <Button variant="secondary" icon="shield" onPress={onOpenConsent} testID="notice-consent">
          {t("citizen:privacy.notice.consentLink")}
        </Button>
        <Button
          variant="secondary"
          icon="file"
          onPress={onAskCorrection}
          testID="notice-correction"
        >
          {t("citizen:privacy.notice.correctionLink")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  head: { gap: spacing.xs },
  right: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  rightText: { flex: 1, gap: spacing.xxs },
  actions: { gap: spacing.sm },
});
