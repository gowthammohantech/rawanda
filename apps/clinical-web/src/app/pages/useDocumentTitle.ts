import { useT } from "@laif/i18n";
import { useEffect } from "react";

/** `<title>` = "<page> · <app name>" in the active language (CLN-01 task 11). */
export function useDocumentTitle(title: string): void {
  const appName = useT("clinical")("appName");
  useEffect(() => {
    document.title = `${title} · ${appName}`;
  }, [title, appName]);
}
