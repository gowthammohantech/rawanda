/**
 * Repository context (CLN-02): the app provides the Dexie-backed repository from `main.tsx`;
 * tests inject a memory-adapter repository through their own `AppServices`.
 */
import type { CareRepository } from "@laif/repositories";
import { createContext, type ReactNode } from "react";

export const RepositoryContext = createContext<CareRepository | null>(null);

export function RepositoryProvider({
  repo,
  children,
}: {
  repo: CareRepository;
  children?: ReactNode;
}) {
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>;
}
