/** Provides the clinical demo session store (CLN-01); read it with `useSession()`. */
import { createContext, type ReactNode } from "react";

import type { AppSession } from "./session-store.ts";

export const SessionContext = createContext<AppSession | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: AppSession;
  children?: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
