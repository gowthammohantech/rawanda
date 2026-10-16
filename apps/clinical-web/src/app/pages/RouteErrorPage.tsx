import { RepositoryError } from "@laif/repositories";
import { DemoBanner, ErrorState, LanguageSwitcher, SkipLink, useTx } from "@laif/ui-web";
import { useRouteError } from "react-router";

import { useDocumentTitle } from "./useDocumentTitle.ts";

/**
 * Route render / loader error (CLN-01 task 10): DemoBanner and EN/RW switcher stay visible;
 * "Try again" reloads the page.
 */
export function RouteErrorPage() {
  const t = useTx();
  const error = useRouteError();
  const title = t("clinical:errors.routeError.title");
  useDocumentTitle(title);
  if (import.meta.env.DEV) console.error("[clinical] route error", error);
  return (
    <div className="bg-canvas min-h-dvh">
      <SkipLink />
      <DemoBanner />
      <div className="mx-auto flex max-w-xl justify-end px-6 pt-4">
        <LanguageSwitcher />
      </div>
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl p-6 outline-none">
        <h1 className="sr-only">{title}</h1>
        <ErrorState
          title={title}
          message={t("clinical:errors.routeError.description")}
          code={error instanceof RepositoryError ? error.code : "INTERNAL"}
          onRetry={() => window.location.reload()}
        />
      </main>
    </div>
  );
}
