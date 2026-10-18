import { useEffect } from "react";
import { RouterProvider, type RouterProviderProps } from "react-router";

import { followOtherTabs } from "../auth/sessionStore.ts";

import { Boot } from "./Boot.tsx";
import { DemoToolsProvider } from "./demo-tools.tsx";
import { AppProviders } from "./providers.tsx";
import type { AppServices } from "./services.ts";

export type AppProps = {
  services: AppServices;
  /** `createBrowserRouter(routes)` in the app, `createMemoryRouter(routes, …)` in tests. */
  router: RouterProviderProps["router"];
};

/** Providers → BrandLoader until seeded → router (shell + routes). */
export function App({ services, router }: AppProps) {
  // ADM-09: an expiry / sign-out in another tab applies here too.
  useEffect(() => followOtherTabs(services.session), [services.session]);
  return (
    <AppProviders services={services}>
      <Boot>
        <DemoToolsProvider>
          <RouterProvider router={router} />
        </DemoToolsProvider>
      </Boot>
    </AppProviders>
  );
}
