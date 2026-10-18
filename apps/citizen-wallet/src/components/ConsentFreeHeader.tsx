/**
 * Header of the consent-free screens (CTZ-08 task 11: Accessibility, Support, Help). With a
 * signed-in persona it is the wallet header (persona pill + menu); before a persona is chosen
 * (welcome footer links) a plain header with Back and the EN/RW switcher.
 */
import { AppHeader } from "@laif/ui-native";
import { useRouter, type Href } from "expo-router";

import { useTitleFocus } from "../a11y/useTitleFocus.ts";
import { usePersona } from "../providers.tsx";
import { WalletHeader } from "./WalletHeader.tsx";

export function ConsentFreeHeader({ title, fallback }: { title: string; fallback: Href }) {
  const persona = usePersona();
  const router = useRouter();
  const titleRef = useTitleFocus();
  const back = () => (router.canGoBack() ? router.back() : router.replace(fallback));
  return persona === null ? (
    <AppHeader title={title} onBack={back} titleRef={titleRef} />
  ) : (
    <WalletHeader title={title} onBack={back} />
  );
}
