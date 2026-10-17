import { useT } from "@laif/i18n";
import { useEffect } from "react";

/** `<title>` = "<page> · <app name>" in the active language. */
export function useDocumentTitle(title: string): void {
  const appName = useT("admin")("appName");
  useEffect(() => {
    document.title = `${title} · ${appName}`;
  }, [title, appName]);
}
