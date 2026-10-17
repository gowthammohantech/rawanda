/**
 * Soft-blue "How to read this" callout (CLN-06): the flag is a prompt for review, not a diagnosis.
 * Wrapped in a named section so the callout's `<aside>` is not a second unnamed complementary
 * landmark next to the shell sidebar (axe `landmark-unique`).
 */
import { InfoCallout, useTx } from "@laif/ui-web";

export function HowToReadCallout() {
  const t = useTx();
  const title = t("clinical:review.howToRead.title");
  return (
    <section data-testid="how-to-read" aria-label={title}>
      <InfoCallout title={title} icon="info">
        <p className="m-0">{t("clinical:review.howToRead.body")}</p>
      </InfoCallout>
    </section>
  );
}
