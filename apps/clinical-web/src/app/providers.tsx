/**
 * App providers (FND-11, CLN-01): I18nProvider → QueryClientProvider → RepositoryProvider (the
 * FND-07 repository, `src/data`) → SessionProvider (demo persona + active facility) →
 * ToastProvider. The router is mounted by `App` inside them; tests inject a
 * memory-adapter repository by passing their own `AppServices`.
 */
import { I18nProvider } from "@laif/i18n";
import { ToastProvider } from "@laif/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { RepositoryProvider } from "../data/RepositoryProvider.tsx";
import { SessionProvider } from "../session/SessionProvider.tsx";
import type { AppServices } from "./services.ts";

export function AppProviders({
  services,
  children,
}: {
  services: AppServices;
  children?: ReactNode;
}) {
  return (
    <I18nProvider i18n={services.i18n}>
      <QueryClientProvider client={services.queryClient}>
        <RepositoryProvider repo={services.repo}>
          <SessionProvider session={services.session}>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </RepositoryProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
