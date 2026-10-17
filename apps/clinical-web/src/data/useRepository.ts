/** `useRepository()` — the clinical `CareRepository` (CLN-02). */
import type { CareRepository } from "@laif/repositories";
import { useContext } from "react";

import { RepositoryContext } from "./RepositoryProvider.tsx";

export function useRepository(): CareRepository {
  const repo = useContext(RepositoryContext);
  if (repo === null) throw new Error("useRepository must be used inside <RepositoryProvider>");
  return repo;
}
