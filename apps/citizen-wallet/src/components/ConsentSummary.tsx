/** What is shown, who can see it and how to withdraw (CTZ-02 task 6). */
import { AppText, Card, Icon, colors, spacing, useTx, type IconName } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

const ITEMS: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: "eye", title: "summaryWhatTitle", body: "summaryWhatBody" },
  { icon: "people", title: "summaryWhoTitle", body: "summaryWhoBody" },
  { icon: "lock", title: "summaryWithdrawTitle", body: "summaryWithdrawBody" },
];

export function ConsentSummary() {
  const t = useTx();
  return (
    <Card testID="consent-summary">
      <View style={styles.list}>
        {ITEMS.map((item) => (
          <View key={item.title} style={styles.item}>
            <Icon name={item.icon} color={colors.primary} size={20} />
            <View style={styles.text}>
              <AppText weight="semibold" accessibilityRole="header">
                {t(`citizen:consent.${item.title}` as never)}
              </AppText>
              <AppText color="muted">{t(`citizen:consent.${item.body}` as never)}</AppText>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  item: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  text: { flex: 1, gap: spacing.xxs },
});
