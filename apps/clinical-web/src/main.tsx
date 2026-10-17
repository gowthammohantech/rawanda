import "./styles.css";

import { installContractsErrorMap } from "@laif/contracts";
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.tsx";
import { APP_ID } from "./app/config.ts";
import { createAppRepository } from "./app/repository.ts";
import { createAppRouter } from "./app/router.tsx";
import { createAppQueryClient } from "./app/services.ts";
import { createAppSession } from "./session/session-store.ts";

installContractsErrorMap();

async function start(): Promise<void> {
  // The stored language is read before the first render (no EN flash for RW users).
  const i18n = await createI18n({
    appId: APP_ID,
    storage: createWebLanguageStorage(APP_ID),
    isDev: import.meta.env.DEV,
  });
  const session = createAppSession();
  const services = {
    i18n,
    session,
    repo: createAppRepository({ session }),
    queryClient: createAppQueryClient(),
  };
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App services={services} router={createAppRouter()} />
    </StrictMode>,
  );
}

void start();
