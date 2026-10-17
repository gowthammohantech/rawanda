/**
 * Startup gate (FND-11 task 3): BrandLoader while `repo.demo.ensureSeeded()` runs; on failure an
 * ErrorState with "Reset demo" (storage failures show `common:error.storageUnavailable`).
 */
import { isStorageUnavailableError, RepositoryError } from "@laif/repositories";
import { BrandLoader, Button, DemoBanner, ErrorState, useTx } from "@laif/ui-web";
import { useEffect, useState, type ReactNode } from "react";

import { useRepository } from "../data/useRepository.ts";

type BootState = { status: "seeding" } | { status: "ready" } | { status: "failed"; error: unknown };

export function Boot({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const t = useTx();
  const [state, setState] = useState<BootState>({ status: "seeding" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    repo.demo.ensureSeeded().then(
      () => {
        if (active) setState({ status: "ready" });
      },
      (error: unknown) => {
        if (active) setState({ status: "failed", error });
      },
    );
    return () => {
      active = false;
    };
  }, [repo, attempt]);

  if (state.status === "seeding") return <BrandLoader />;
  if (state.status === "ready") return <>{children}</>;

  const { error } = state;
  const code = error instanceof RepositoryError ? error.code : undefined;
  const resetDemo = async () => {
    try {
      await repo.demo.resetDemo();
      setState({ status: "ready" });
    } catch (resetError) {
      setState({ status: "failed", error: resetError });
    }
  };
  return (
    <div className="bg-canvas min-h-dvh">
      <DemoBanner />
      <main id="main" className="mx-auto max-w-xl p-6">
        <ErrorState
          title={t("demo:seedFailed.title")}
          message={
            isStorageUnavailableError(error)
              ? t("common:error.storageUnavailable")
              : t("demo:seedFailed.description")
          }
          {...(code === undefined ? {} : { code })}
          onRetry={() => {
            setState({ status: "seeding" });
            setAttempt((value) => value + 1);
          }}
          action={
            <Button variant="danger" size="sm" icon="refresh" onClick={resetDemo}>
              {t("demo:tools.reset")}
            </Button>
          }
        />
      </main>
    </div>
  );
}
