/** Services created before the first render (i18n reads the stored language first). */
import { installContractsErrorMap } from "@laif/contracts";
import { createI18n, type I18nInstance } from "@laif/i18n";
import { QueryClient } from "@tanstack/react-query";

import { APP_ID } from "./config.ts";
import { createDeviceClockStore, type DeviceClockStore } from "./demo/clockDrift.ts";
import { platform } from "./platform";
import { createSessionStore, type SessionStore } from "./session/store.ts";

export type ShellServices = {
  i18n: I18nInstance;
  session: SessionStore;
  queryClient: QueryClient;
  /** HWM-10 simulated device-clock offset + last detected drift. */
  deviceClock: DeviceClockStore;
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

export async function bootstrapShell(): Promise<ShellServices> {
  installContractsErrorMap();
  const i18n = await createI18n({
    appId: APP_ID,
    storage: platform.languageStorage(),
    isDev: __DEV__,
  });
  return {
    i18n,
    session: createSessionStore(platform.personaStorage()),
    queryClient: createAppQueryClient(),
    deviceClock: createDeviceClockStore(platform.personaStorage()),
  };
}
