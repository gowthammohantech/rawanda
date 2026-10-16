/**
 * Root layout (FND-11): providers + BrandSplash until fonts, i18n, the seeded local database and
 * (HWM-01) the device session are ready (`AppRoot` → `Boot` → `SessionProvider`); then the Expo
 * Router stack: `(auth)` sign-in / scope, `(app)` guarded tabs + settings, `/revoked`.
 * `/` is the Today tab inside `(app)`, whose guard redirects to `/sign-in` without a session (a
 * separate root `index.tsx` would collide with `(app)/(tabs)/index`).
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
