/**
 * Onboarding stack (CTZ-02): welcome, about, persona, verify, recover, consent, demo tools;
 * CTZ-08: accessibility and support (+ help) usable before a persona is chosen.
 */
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
