/** The five wallet tabs (CTZ-02 task 10): order, i18n label keys and kit icons. */
import type { IconName, TranslationKey } from "@laif/ui-native";

import type { WalletTab } from "../state/session.ts";

/** Tab item min height (≥ 44pt touch target; 56 per the phase). */
export const TAB_ITEM_MIN_HEIGHT = 56;

export const WALLET_TAB_ITEMS: readonly {
  name: WalletTab;
  labelKey: TranslationKey;
  icon: IconName;
}[] = [
  { name: "health", labelKey: "citizen:nav.health", icon: "heart" },
  { name: "next-steps", labelKey: "citizen:nav.nextSteps", icon: "clipboard" },
  { name: "reminders", labelKey: "citizen:nav.reminders", icon: "bell" },
  { name: "timeline", labelKey: "citizen:nav.timeline", icon: "activity" },
  { name: "more", labelKey: "citizen:nav.more", icon: "user" },
];
