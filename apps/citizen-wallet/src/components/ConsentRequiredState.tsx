/**
 * A wallet screen whose read failed with `CONSENT_REQUIRED` (consent was withdrawn while it was
 * open). Shows the calm consent-withdrawn explanation and "Give consent again" instead of an
 * endless skeleton; the route guard redirects to the consent-withdrawn screen as well. No health
 * value, count or name is rendered.
 */
import { Button, PermissionDenied, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { HREFS } from "../state/access.ts";

export function ConsentRequiredState() {
  const t = useTx();
  const router = useRouter();
  return (
    <PermissionDenied
      title={t("citizen:consent.withdrawnTitle")}
      message={t("citizen:consent.withdrawnBody")}
      action={
        <Button onPress={() => router.push(HREFS.consent)} testID="consent-required-give">
          {t("citizen:consent.giveAgain")}
        </Button>
      }
    />
  );
}
