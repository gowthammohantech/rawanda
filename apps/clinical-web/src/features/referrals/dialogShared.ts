/** Small helpers shared by the referral dialogs (CLN-08). */
import type { ParsedValidationMessage } from "@laif/contracts";
import type { Referral } from "@laif/domain";
import { useState } from "react";

import type { ClinicalError } from "../../data/errors.ts";

/** Server-side field error (`VALIDATION_ERROR`) of one form field. */
export function serverFieldError(
  error: ClinicalError | null,
  name: string,
): ParsedValidationMessage | undefined {
  return error?.code === "VALIDATION_ERROR" ? error.fieldErrors?.[name] : undefined;
}

/**
 * The referral a dialog works on: the prop, or the latest copy loaded from a conflict panel
 * ("Reload latest") until the list catches up. The next save uses the reloaded version.
 */
export function useReloadableReferral(fromProps: Referral) {
  const [reloaded, setReloaded] = useState<Referral | null>(null);
  const current =
    reloaded !== null && reloaded.id === fromProps.id && reloaded.version >= fromProps.version
      ? reloaded
      : fromProps;
  return { current, setReloaded, clear: () => setReloaded(null) };
}
