import { useTx } from "../i18n.ts";

export type SkipLinkProps = { targetId?: string };

/** First focusable element of every page: jumps to `<main id="main">`. */
export function SkipLink({ targetId = "main" }: SkipLinkProps) {
  const t = useTx();
  return (
    <a
      href={`#${targetId}`}
      className="bg-primary-dark text-on-primary sr-only rounded-sm px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100]"
    >
      {t("shell:skipToContent")}
    </a>
  );
}
