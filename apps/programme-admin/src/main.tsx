import "./styles.css";
import "./app/responsive.css";

import { installContractsErrorMap } from "@laif/contracts";
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import type { FaultConfigPatch } from "@laif/repositories";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App.tsx";
import { APP_ID, IS_E2E } from "./app/config.ts";
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
  const services = createAppServices({ i18n });
  if (IS_E2E) {
    // E2E test seam (VITE_LAIF_E2E=1 builds only): change faults while a modal dialog is open
    // (e.g. a timeout armed between filling a form and submitting it).
    (window as unknown as Record<string, unknown>)["__laifAdminE2E"] = {
      setFaults: (patch: FaultConfigPatch) => services.repo.demo.setFaults(patch),
    };
  }
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App services={services} router={createAppRouter()} />
    </StrictMode>,
  );
}

void start();
