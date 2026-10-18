import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavLink } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { AppShell } from "./AppShell.tsx";
import { Breadcrumb, PageHeader } from "./PageHeader.tsx";
import { Sidebar, type SidebarSection } from "./Sidebar.tsx";
import { SubNav } from "./SubNav.tsx";
import { Topbar } from "./Topbar.tsx";
import { Button } from "./Button.tsx";

const sections: SidebarSection[] = [
  {
    labelKey: "shell:nav.section.work",
    items: [
      {
        to: "/clinical/queue",
        labelKey: "shell:nav.section.overview",
        icon: "home",
        count: 8,
        countTone: "danger",
      },
      { to: "/clinical/patients", labelKey: "shell:nav.section.patients", icon: "people" },
    ],
  },
  {
    labelKey: "shell:nav.section.reports",
    items: [{ to: "/clinical/audit", labelKey: "shell:nav.section.reports", icon: "shield" }],
  },
];

describe("Sidebar", () => {
  it("renders grouped nav with section labels, counts and the active link (NavLink)", async () => {
    const { container } = renderUi(<Sidebar sections={sections} LinkComponent={NavLink} />, {
      route: "/clinical/patients",
    });
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByText("Work")).toBeTruthy();
    expect(within(nav).getByText("8")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Patients" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      within(nav)
        .getByRole("link", { name: /Overview/ })
        .getAttribute("aria-current"),
    ).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("renders a disabled item as non-link text with its reason (tooltip + screen reader)", async () => {
    const { container } = renderUi(
      <Sidebar
        sections={[
          {
            items: [
              {
                to: "/clinical/audit",
                labelKey: "shell:nav.section.reports",
                icon: "shield",
                disabled: true,
                disabledReason: "Not available for this demo role",
              },
            ],
          },
        ]}
        activePath="/clinical/queue"
      />,
    );
    expect(screen.queryByRole("link", { name: /Reports/ })).toBeNull();
    const item = screen.getByText("Reports").parentElement as HTMLElement;
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toBe("Not available for this demo role");
    expect(item.textContent).toContain("Not available for this demo role");
    await expectNoAxeViolations(container);
  });

  it("works router-free with activePath", () => {
    renderUi(<Sidebar sections={sections} activePath="/clinical/queue/123" />);
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

describe("SubNav", () => {
  it("renders indented child nav", async () => {
    const { container } = renderUi(
      <SubNav
        activePath="/a/knowledge"
        items={[
          { to: "/a/overview", labelKey: "shell:nav.section.overview" },
          { to: "/a/knowledge", labelKey: "shell:nav.section.reports", count: 24 },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Section navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Reports/ }).getAttribute("aria-current")).toBe("page");
    await expectNoAxeViolations(container);
  });
});

describe("PageHeader / Breadcrumb", () => {
  it("renders breadcrumb, h1, subtitle and right-aligned actions", async () => {
    const { container } = renderUi(
      <PageHeader
        breadcrumbs={[{ label: "Referrals", to: "/clinical/referrals" }, { label: "REF-001" }]}
        LinkComponent={NavLink}
        title="Referral REF-001"
        subtitle="Created 14 Oct 2026"
        secondaryActions={<Button variant="secondary">Back</Button>}
        primaryAction={<Button>Complete</Button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Referral REF-001" })).toBeTruthy();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Referrals" })).toBeTruthy();
    expect(within(crumb).getByText("REF-001").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Complete" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("Breadcrumb works without a router", () => {
    renderUi(<Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Here" }]} />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
  });
});

describe("Topbar", () => {
  it("always renders the LanguageSwitcher, plus search, bell and slots", async () => {
    const user = userEvent.setup();
    const onBell = vi.fn();
    const { container } = renderUi(
      <Topbar
        notifications={{ hasUnread: true, onClick: onBell }}
        persona={<span>persona</span>}
      />,
    );
    expect(screen.getByRole("group", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("search")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search" }).getAttribute("placeholder")).toBe(
      "Search patients and records",
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(onBell).toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });
});

describe("AppShell", () => {
  it("always contains the skip link, DemoBanner text, LanguageSwitcher and <main id=main>", async () => {
    const { container } = renderUi(
      <AppShell
        sidebar={<Sidebar sections={sections} LinkComponent={NavLink} />}
        banners={<p>role banner</p>}
      >
        <h1>Queue</h1>
      </AppShell>,
      { route: "/clinical/queue" },
    );
    expect(
      screen.getByText("DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE"),
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to main content" }).getAttribute("href")).toBe(
      "#main",
    );
    expect(screen.getByRole("main").id).toBe("main");
    expect(screen.getByText("role banner")).toBeTruthy();
    await expectNoAxeViolations(container, true);
  });

  it("opens the sidebar in a drawer from the menu button (mobile) and closes on navigation", async () => {
    const user = userEvent.setup();
    renderUi(
      <AppShell sidebar={<Sidebar sections={sections} LinkComponent={NavLink} />}>
        <h1>Queue</h1>
      </AppShell>,
      { route: "/clinical/queue" },
    );
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Main navigation" });
    await user.click(within(drawer).getByRole("link", { name: "Patients" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an optional tablet rail (768–1023 px) and a compact sidebar width", () => {
    const { container } = renderUi(
      <AppShell
        sidebar={<Sidebar sections={sections} LinkComponent={NavLink} />}
        rail={<nav aria-label="Shortcuts">rail</nav>}
        compactSidebar
      >
        <h1>Queue</h1>
      </AppShell>,
      { route: "/clinical/queue" },
    );
    const rail = screen.getByRole("navigation", { name: "Shortcuts" }).parentElement;
    expect(rail?.className).toContain("md:block");
    expect(rail?.className).toContain("lg:hidden");
    const sidebarAside = [...container.querySelectorAll("aside")].find((a) =>
      a.querySelector("nav"),
    );
    expect(sidebarAside?.className).toContain("w-52 xl:w-60");
  });

  it("renders the banner in Kinyarwanda", () => {
    renderUi(
      <AppShell sidebar={<Sidebar sections={sections} />}>
        <h1>Queue</h1>
      </AppShell>,
      { language: "rw" },
    );
    expect(screen.getByText(/IGERAGEZA/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Ururimi" })).toBeTruthy();
  });
});
