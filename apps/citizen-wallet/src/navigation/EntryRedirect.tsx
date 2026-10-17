/** `/` (CTZ-02): no persona → welcome; otherwise the last tab (the `(app)` guard re-evaluates). */
import { Redirect } from "expo-router";

import { usePersona, useWallet } from "../providers.tsx";

export function EntryRedirect() {
  const persona = usePersona();
  const lastTab = useWallet((s) => s.lastTab);
  if (persona === null) return <Redirect href="/welcome" />;
  return <Redirect href={`/${lastTab}`} />;
}
