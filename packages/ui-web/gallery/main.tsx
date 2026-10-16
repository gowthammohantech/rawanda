import "./gallery.css";

import { createI18n, I18nProvider, type I18nInstance } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { BrandLoader, ToastProvider } from "../src/index.ts";
import { Gallery } from "./Gallery.tsx";

function useHashPath(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#shell");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#shell");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App({ i18n }: { i18n: I18nInstance }) {
  const activePath = useHashPath();
  return (
    <I18nProvider i18n={i18n}>
      <ToastProvider>
        <Gallery activePath={activePath} />
      </ToastProvider>
    </I18nProvider>
  );
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    <BrandLoader />
  </StrictMode>,
);

void createI18n({ appId: "clinical", storage: createWebLanguageStorage("clinical") }).then(
  (i18n) => {
    root.render(
      <StrictMode>
        <App i18n={i18n} />
      </StrictMode>,
    );
  },
);
