import { EmptyState, PageHeader, useTx, type TranslationKey } from "@laif/ui-web";
import { Link } from "react-router";

import { START_PATH } from "../../app/config.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export type NotFoundPageProps = {
  /** `unknownScope`: a district / facility id that does not exist (ScopeGuard). */
  variant?: "route" | "unknownScope";
};

export function NotFoundPage({ variant = "route" }: NotFoundPageProps) {
  const t = useTx();
  const keys: Record<"title" | "description", TranslationKey> =
    variant === "route"
      ? { title: "admin:notFound.title", description: "admin:notFound.description" }
      : {
          title: "admin:errors.unknownScope.title",
          description: "admin:errors.unknownScope.description",
        };
  const title = t(keys.title);
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon="search"
        title={title}
        description={t(keys.description)}
        action={
          <Link
            to={START_PATH}
            className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
          >
            {t("admin:notFound.home")}
          </Link>
        }
      />
    </>
  );
}
