import { useT } from "@laif/i18n";
import { useEffect } from "react";

/**
 * `<title>` = "{Page} · Programme Dashboard · CareConnect (Demo)" in the active language
 * (ADM-09 task 7; `admin:states.titleSuffix`).
 */
export function useDocumentTitle(title: string): void {
  const suffix = useT("admin")("states.titleSuffix");
  useEffect(() => {
    document.title = `${title} · ${suffix}`;
  }, [title, suffix]);
}
