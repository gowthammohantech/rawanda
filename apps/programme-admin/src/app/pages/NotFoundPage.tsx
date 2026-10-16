import { EmptyState, PageHeader, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { START_PATH } from "../config.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

export function NotFoundPage() {
  const t = useTx();
  const title = t("admin:notFound.title");
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon="search"
        title={title}
        description={t("admin:notFound.description")}
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
