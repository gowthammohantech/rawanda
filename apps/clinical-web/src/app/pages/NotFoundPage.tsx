import { EmptyState, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { PageHeader } from "../../components/PageHeader.tsx";
import { routes } from "../routes.ts";

/** Unknown `/clinical/*` path, inside the shell (CLN-01 task 10). */
export function NotFoundPage() {
  const t = useTx();
  const title = t("clinical:errors.notFound.title");
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon="search"
        title={title}
        description={t("clinical:errors.notFound.description")}
        action={
          <Link
            to={routes.queue()}
            className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
          >
            {t("clinical:errors.notFound.home")}
          </Link>
        }
      />
    </>
  );
}
