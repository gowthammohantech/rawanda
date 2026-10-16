import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { DemoToolsMenu } from "./DemoToolsMenu.tsx";
import { IconButton } from "./IconButton.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";
import { PersonaSwitcher } from "./PersonaSwitcher.tsx";

describe("IconButton", () => {
  it("is labelled from its key and announces the badge", async () => {
    const { container } = renderUi(
      <IconButton
        icon="bell"
        labelKey="shell:notifications.label"
        badge
        badgeLabelKey="shell:notifications.unread"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Notifications. You have unread notifications" }),
    ).toBeTruthy();
    expect(screen.getByTestId("icon-button-badge")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("LanguageSwitcher", () => {
  it("switches EN → RW with the keyboard and reflects aria-pressed", async () => {
    const user = userEvent.setup();
    const { container, i18n } = renderUi(<LanguageSwitcher />);
    expect(screen.getByRole("group", { name: "Language" })).toBeTruthy();
    const en = screen.getByRole("button", { name: "English" });
    const rw = screen.getByRole("button", { name: "Ikinyarwanda" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
    expect(rw.getAttribute("aria-pressed")).toBe("false");
    await expectNoAxeViolations(container);

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(rw);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(i18n.language).toBe("rw"));
    await waitFor(() => expect(screen.getByRole("group", { name: "Ururimi" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Ikinyarwanda" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("PersonaSwitcher", () => {
  it("lists personas, labels itself demo-only and switches", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderUi(
      <PersonaSwitcher
        value="p1"
        onChange={onChange}
        personas={[
          { id: "p1", name: "Demo Clinician A", roleLabel: "Clinician", scopeLabel: "Alpha-1" },
          { id: "p2", name: "Demo Nurse B", roleLabel: "Nurse reviewer" },
        ]}
      />,
    );
    await expectNoAxeViolations(container);
    const trigger = screen.getByRole("button", { name: /Switch demo persona/ });
    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(menu.textContent).toContain("Demo role switch — not authentication");
    await user.click(screen.getByRole("menuitemradio", { name: /Demo Nurse B/ }));
    expect(onChange).toHaveBeenCalledWith("p2");
  });
});

describe("DemoToolsMenu", () => {
  it("toggles faults, loads a scenario and confirms reset", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onFaultChange = vi.fn();
    const onLoadScenario = vi.fn();
    renderUi(
      <DemoToolsMenu
        faults={{ offline: false, slow: false, errors: false }}
        onFaultChange={onFaultChange}
        onReset={onReset}
        scenarios={[{ id: "SCN-02", title: "Flagged screening" }]}
        onLoadScenario={onLoadScenario}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Demo tools" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Offline" }));
    expect(onFaultChange).toHaveBeenCalledWith("offline", true);

    await user.keyboard("{Escape}");
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Reset demo" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" });
    expect(dialog.textContent).toContain("cannot be undone");
    expect(onReset).not.toHaveBeenCalled();
    await expectNoAxeViolations(dialog);
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(trigger);
    const sub = await screen.findByRole("menuitem", { name: "Load scenario" });
    sub.focus();
    await user.keyboard("{ArrowRight}");
    const item = await screen.findByRole("menuitem", { name: /Flagged screening/ });
    await waitFor(() => expect(document.activeElement).toBe(item));
    await user.keyboard("{Enter}");
    expect(onLoadScenario).toHaveBeenCalledWith("SCN-02");
  });
});
