/**
 * "Check national ID (not connected in demo)" (CLN-03 task 9, FRD T-07): calls the simulated
 * adapter, which always rejects with `DEPENDENCY_UNAVAILABLE`, and says so. No identity is
 * fetched, fabricated or stored.
 */
import { Button, Card, Icon, useTx } from "@laif/ui-web";
import { useState } from "react";

import { toClinicalError, type ClinicalErrorCode } from "../../data/errors.ts";
import {
  simulatedNationalIdentityAdapter,
  type ExternalIdentityAdapter,
} from "../../data/externalIdentity.ts";

export type ExternalIdentityStubProps = {
  syntheticIdentifier: string;
  /** Test seam (default: the simulated, never-connected adapter). */
  adapter?: ExternalIdentityAdapter;
};

export function ExternalIdentityStub({
  syntheticIdentifier,
  adapter = simulatedNationalIdentityAdapter,
}: ExternalIdentityStubProps) {
  const t = useTx();
  const [code, setCode] = useState<ClinicalErrorCode | null>(null);

  const check = async () => {
    setCode(null);
    try {
      await adapter.lookup({ syntheticIdentifier });
    } catch (error) {
      setCode(toClinicalError(error).code);
    }
  };

  return (
    <Card title={t("clinical:patients.record.externalId.title")} as="section">
      <div className="space-y-3 text-sm">
        <p className="text-muted m-0">{t("clinical:patients.record.externalId.description")}</p>
        <Button
          variant="secondary"
          icon="search"
          onClick={check}
          className="h-auto max-w-full py-2 text-start whitespace-normal!"
        >
          {t("clinical:patients.record.externalId.button")}
        </Button>
        {code === null ? null : (
          <p
            role="status"
            data-testid="external-identity-result"
            data-error-code={code}
            className="border-border bg-background text-ink m-0 flex gap-2 rounded-md border p-3"
          >
            <Icon name="info" size={16} className="text-muted mt-0.5 shrink-0" />
            <span>
              {t("clinical:patients.record.externalId.unavailable")}{" "}
              <span className="text-muted font-mono text-[12px]">{code}</span>
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}
