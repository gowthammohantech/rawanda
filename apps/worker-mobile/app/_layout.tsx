/**
 * Root layout (FND-11): providers + BrandSplash until fonts, i18n and the seeded local database
 * are ready; then the Expo Router stack.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppRoot } from "../src/AppRoot.tsx";

export default function RootLayout() {
  return (
    <AppRoot>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AppRoot>
  );
}
