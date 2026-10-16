import { flushSync } from "react-dom";
import { RouterProvider, type RouterProviderProps } from "react-router";

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
  return (
    <AppProviders services={services}>
      <Boot>
        <DemoToolsProvider>
          <RouterProvider
            router={router}
            flushSync={(fn) => {
              flushSync(fn);
            }}
          />
        </DemoToolsProvider>
      </Boot>
    </AppProviders>
  );
}
