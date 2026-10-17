/** Onboarding stack (CTZ-02): welcome, about, persona, verify, recover, consent, demo tools. */
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
