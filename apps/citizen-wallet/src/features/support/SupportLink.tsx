/**
 * "Questions? Contact your care team" (CTZ-08 task 9) → More → Support. Shown on result detail,
 * next-step detail, the timeline empty state and the consent-withdrawn screen.
 */
import { Button, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

export const SUPPORT_HREF = "/more/support" as const;

export function SupportLink({ testID = "support-link" }: { testID?: string }) {
  const t = useTx();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      icon="people"
      onPress={() => router.push(SUPPORT_HREF)}
      accessibilityHint={t("citizen:support.linkHint")}
      testID={testID}
    >
      {t("citizen:support.link")}
    </Button>
  );
}
