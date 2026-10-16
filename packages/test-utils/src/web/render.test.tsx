// @vitest-environment jsdom
import { useT } from "@laif/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { createContext, useContext } from "react";
import { useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "./render.tsx";

afterEach(cleanup);

const RepoContext = createContext<{ name: string } | null>(null);

function Probe() {
  const t = useT("shell");
  const location = useLocation();
  const client = useQueryClient();
  const repo = useContext(RepoContext);
  return (
    <div>
      <p>{t("skipToContent")}</p>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="retry">{String(client.getDefaultOptions().queries?.retry)}</p>
      <p data-testid="repo">{repo?.name ?? "none"}</p>
    </div>
  );
}

describe("renderWithProviders", () => {
  it("provides i18n (EN by default), router, query client with retry off", () => {
    renderWithProviders(<Probe />, { route: "/clinical/queue" });
    expect(screen.getByText("Skip to main content")).toBeTruthy();
    expect(screen.getByTestId("path").textContent).toBe("/clinical/queue");
    expect(screen.getByTestId("retry").textContent).toBe("false");
    expect(screen.getByTestId("repo").textContent).toBe("none");
  });

  it("renders Kinyarwanda and an injected repository context", () => {
    const result = renderWithProviders(<Probe />, {
      language: "rw",
      repo: { context: RepoContext, value: { name: "memory" } },
    });
    expect(screen.getByText("Jya ku bikubiyemo by'ingenzi")).toBeTruthy();
    expect(screen.getByTestId("repo").textContent).toBe("memory");
    expect(result.i18n.language).toBe("rw");
  });
});
