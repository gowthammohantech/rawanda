/**
 * Facility contact card (CTZ-04 task 3; CW-08 contact path): synthetic phone, opening hours and a
 * plain-text address from `@laif/mock-data` reference data (no maps — low bandwidth). "Call"
 * NEVER dials: it opens a sheet explaining the number is a demo number that does not connect.
 */
import { facilityContactOf } from "@laif/mock-data";
import {
  AppText,
  Button,
  Card,
  KeyValueList,
  Sheet,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

export function FacilityContactCard({
  facilityId,
  facilityName,
}: {
  facilityId: string;
  facilityName: string;
}) {
  const t = useTx();
  const [sheetOpen, setSheetOpen] = useState(false);
  const contact = facilityContactOf(facilityId);

  if (contact === null) {
    return (
      <Card title={t("citizen:nextSteps.contact.title")} testID="facility-contact">
        <AppText color="muted">{t("citizen:nextSteps.contact.unavailable")}</AppText>
      </Card>
    );
  }

  const hours = t("citizen:nextSteps.contact.hoursValue", {
    days: t(`citizen:nextSteps.contact.days.${contact.hours.days}` as TranslationKey),
    opens: contact.hours.opens,
    closes: contact.hours.closes,
  });

  return (
    <Card
      eyebrow={t("citizen:nextSteps.contact.title")}
      title={facilityName}
      testID="facility-contact"
    >
      <KeyValueList
        testID="facility-contact-details"
        items={[
          {
            id: "phone",
            label: t("citizen:nextSteps.contact.phone"),
            value: (
              <View style={styles.phone}>
                <AppText weight="semibold">{contact.phoneDisplay}</AppText>
                <AppText variant="caption" color="muted" testID="demo-number-label">
                  {t("citizen:nextSteps.contact.demoNumber")}
                </AppText>
              </View>
            ),
          },
          { id: "hours", label: t("citizen:nextSteps.contact.hours"), value: hours },
          { id: "address", label: t("citizen:nextSteps.contact.address"), value: contact.address },
        ]}
      />
      <Button
        variant="secondary"
        onPress={() => setSheetOpen(true)}
        accessibilityHint={t("citizen:nextSteps.contact.callHint")}
        testID="contact-call"
      >
        {t("citizen:nextSteps.contact.call")}
      </Button>
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("citizen:nextSteps.contact.sheetTitle")}
        footer={
          <Button onPress={() => setSheetOpen(false)} testID="contact-sheet-close">
            {t("citizen:nextSteps.contact.close")}
          </Button>
        }
        testID="contact-sheet"
      >
        <AppText>{t("citizen:nextSteps.contact.demoNumber")}</AppText>
        <AppText color="muted">
          {t("citizen:nextSteps.contact.sheetBody", { phone: contact.phoneDisplay })}
        </AppText>
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  phone: { gap: spacing.xxs },
});
