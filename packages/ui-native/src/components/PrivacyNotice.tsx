import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import { InfoCallout } from "./InfoCallout.tsx";

export type PrivacyNoticeProps = {
  /** Already-translated title; defaults to `common:privacy.title`. */
  title?: string;
  /** App-specific notice body; defaults to the synthetic-data statement. */
  children?: ReactNode;
};

export function PrivacyNotice({ title, children }: PrivacyNoticeProps) {
  const t = useTx();
  return (
    <InfoCallout
      icon="lock"
      tone="primary"
      title={title ?? t("common:privacy.title")}
      testID="privacy-notice"
    >
      {children ?? t("common:privacy.body")}
    </InfoCallout>
  );
}
