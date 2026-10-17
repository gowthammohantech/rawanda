/**
 * Startup gate (FND-11): BrandSplash while the local database opens and
 * `repo.demo.ensureSeeded()` runs; on failure a Screen (DemoBanner) with ErrorState, "Try again"
 * and "Reset demo" (storage failures show `common:error.storageUnavailable`).
 */
import { isStorageUnavailableError, RepositoryError, type StoreAdapter } from "@laif/repositories";
import { BrandSplash, Button, ErrorState, Screen, useTx } from "@laif/ui-native";
import { useEffect, useState, type ReactNode } from "react";

import { DemoToolsProvider } from "./demo-tools.tsx";
import { CitizenRepoProvider, createAppRepository, type CitizenRepository } from "./data/repo.tsx";
import { useSession } from "./providers.tsx";

type BootState =
  | { status: "starting" }
  | { status: "ready"; repo: CitizenRepository }
  | { status: "failed"; error: unknown; repo: CitizenRepository | null };

export type BootProps = {
  openStore: () => Promise<StoreAdapter>;
  /** Test seam: skip the simulated latency. */
  noLatency?: boolean;
  children?: ReactNode;
};

export function Boot({ openStore, noLatency, children }: BootProps) {
  const session = useSession();
  const t = useTx();
  const [state, setState] = useState<BootState>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const start = async () => {
      let repo: CitizenRepository | null = null;
      try {
        const store = await openStore();
        repo = createAppRepository({
          session,
          store,
          ...(noLatency === undefined ? {} : { noLatency }),
        });
        await repo.demo.ensureSeeded();
        if (active) setState({ status: "ready", repo });
      } catch (error) {
        if (active) setState({ status: "failed", error, repo });
      }
    };
    void start();
    return () => {
      active = false;
    };
  }, [openStore, session, noLatency, attempt]);

  if (state.status === "starting") return <BrandSplash />;
  if (state.status === "ready") {
    return (
      <CitizenRepoProvider repo={state.repo}>
        <DemoToolsProvider>{children}</DemoToolsProvider>
      </CitizenRepoProvider>
    );
  }

  const { error, repo } = state;
  const code = error instanceof RepositoryError ? error.code : undefined;
  const resetDemo = async () => {
    if (repo === null) return;
    try {
      await repo.demo.resetDemo();
      setState({ status: "ready", repo });
    } catch (resetError) {
      setState({ status: "failed", error: resetError, repo });
    }
  };
  return (
    <Screen testID="boot-error">
      <ErrorState
        title={t("demo:seedFailed.title")}
        message={
          isStorageUnavailableError(error)
            ? t("common:error.storageUnavailable")
            : t("demo:seedFailed.description")
        }
        {...(code === undefined ? {} : { code })}
        onRetry={() => {
          setState({ status: "starting" });
          setAttempt((value) => value + 1);
        }}
        action={
          repo === null ? undefined : (
            <Button variant="danger" icon="refresh" onPress={resetDemo}>
              {t("demo:tools.reset")}
            </Button>
          )
        }
      />
    </Screen>
  );
}
