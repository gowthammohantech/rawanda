/**
 * Root of the Expo app (FND-11): BrandSplash until fonts + i18n (stored language) are ready,
 * then the providers, then `Boot` (database + seed), then the router children.
 */
import type { StoreAdapter } from "@laif/repositories";
import { BrandSplash, useLaifFonts } from "@laif/ui-native";
import { useEffect, useState, type ReactNode } from "react";
import type { Metrics } from "react-native-safe-area-context";

import { Boot } from "./Boot.tsx";
import { platform } from "./platform";
import { AppProviders } from "./providers.tsx";
import { bootstrapShell, type ShellServices } from "./services.ts";

const openPlatformStore = () => platform.openStore();

export type AppRootProps = {
  children?: ReactNode;
  /** Test seams. */
  bootstrap?: () => Promise<ShellServices>;
  openStore?: () => Promise<StoreAdapter>;
  noLatency?: boolean;
  safeAreaMetrics?: Metrics | null;
};

export function AppRoot({
  children,
  bootstrap = bootstrapShell,
  openStore = openPlatformStore,
  noLatency,
  safeAreaMetrics,
}: AppRootProps) {
  const fonts = useLaifFonts();
  const [services, setServices] = useState<ShellServices | null>(null);

  useEffect(() => {
    let active = true;
    void bootstrap().then((created) => {
      if (active) setServices(created);
    });
    return () => {
      active = false;
    };
  }, [bootstrap]);

  if (!fonts.loaded || services === null) return <BrandSplash />;
  return (
    <AppProviders
      services={services}
      {...(safeAreaMetrics === undefined ? {} : { safeAreaMetrics })}
    >
      <Boot openStore={openStore} {...(noLatency === undefined ? {} : { noLatency })}>
        {children}
      </Boot>
    </AppProviders>
  );
}
