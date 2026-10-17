/**
 * ErrorState for a failed repository read or write (CLN-02): copy from
 * `clinical:errors.<code>.title|body` via `toClinicalError`, the original code on the "Error
 * code" line, and an optional retry. Never shows internal message or stack text.
 */
import { ErrorState, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { clinicalErrorKeys, toClinicalError } from "../data/errors.ts";

export type QueryErrorStateProps = {
  error: unknown;
  onRetry?: () => unknown;
  action?: ReactNode;
  className?: string;
};

export function QueryErrorState({ error, onRetry, action, className }: QueryErrorStateProps) {
  const t = useTx();
  const mapped = toClinicalError(error);
  const keys = clinicalErrorKeys(mapped.code);
  return (
    <ErrorState
      code={mapped.sourceCode}
      title={t(keys.title)}
      message={t(keys.body)}
      {...(onRetry === undefined ? {} : { onRetry })}
      {...(action === undefined ? {} : { action })}
      {...(className === undefined ? {} : { className })}
    />
  );
}
