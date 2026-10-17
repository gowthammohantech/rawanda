import { DemoBanner, ErrorState } from "@laif/ui-web";

/** Route render error: still shows the DemoBanner; "Try again" reloads the page. */
export function RouteErrorPage() {
  return (
    <div className="bg-canvas min-h-dvh">
      <DemoBanner />
      <main id="main" className="mx-auto max-w-xl p-6">
        <ErrorState code="INTERNAL" onRetry={() => window.location.reload()} />
      </main>
    </div>
  );
}
