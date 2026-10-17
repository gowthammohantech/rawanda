import "./styles.css";

import { installContractsErrorMap } from "@laif/contracts";
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.tsx";
import { APP_ID } from "./app/config.ts";
import { createAppRouter } from "./app/router.tsx";
import { createAppServices } from "./app/services.ts";

installContractsErrorMap();

async function start(): Promise<void> {
  // The stored language is read before the first render (no EN flash for RW users).
  const i18n = await createI18n({
    appId: APP_ID,
    storage: createWebLanguageStorage(APP_ID),
    isDev: import.meta.env.DEV,
  });
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App services={createAppServices({ i18n })} router={createAppRouter()} />
    </StrictMode>,
  );
}

void start();
