import { useContext } from "react";

import { SessionContext, type SessionContextValue } from "./SessionProvider.tsx";

/** `{ session, status, signIn, signOut, refresh }` of the demo device sign-in. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
