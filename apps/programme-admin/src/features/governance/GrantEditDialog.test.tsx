/**
 * GrantEditDialog (ADM-08 §10): validation in EN and RW (justification, empty scope), a saved
 * edit (version n → n+1 with a before/after audit), the `LAST_ADMIN` lockout (role change and
 * "Revoke now" on the editor's own grant), the conflict notice after a simulated stale version,
 * and the read-only Roles tab for non-admin personas.
 */
import type { AccessGrant } from "@laif/contracts";
import { ADMIN_GRANT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { findAdminPersona } from "../../auth/personas.ts";
import { auditEvents, bootApp } from "../../test/app.tsx";

const ROLES_TAB = "/admin/governance?tab=roles";
type User = ReturnType<typeof userEvent.setup>;

const nameOf = (id: string) => findAdminPersona(id)?.displayName ?? id;

async function openEditor(user: User, personaId: string, options: { rw?: boolean } = {}) {
  const booted = await bootApp({
    path: ROLES_TAB,
    signInAs: PERSONA_IDS.leadProgramme,
    waitFor: "grant-table",
  });
  await screen.findByTestId(`grant-row-${personaId}`, {}, { timeout: 10_000 });
  if (options.rw === true) await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
  const editName =
    options.rw === true
      ? `Hindura uburenganzira bwa ${nameOf(personaId)}`
      : `Edit the access grant of ${nameOf(personaId)}`;
  await user.click(screen.getByRole("button", { name: editName }));
  const form = await screen.findByTestId("grant-edit-form");
  return { ...booted, form, dialog: screen.getByRole("dialog") };
}

const grantIn = async (store: Parameters<typeof readStoreCollection>[0], id: string) =>
  (await readStoreCollection<AccessGrant>(store, "accessGrants")).find((g) => g.id === id);

describe("GrantEditDialog", () => {
  it("EN: justification and scope errors; nothing is saved", async () => {
    const user = userEvent.setup();
    const { dialog, form, store } = await openEditor(user, PERSONA_IDS.analystAlpha);
    await user.click(within(form).getByRole("checkbox", { name: "Demo District Alpha" }));
    await user.click(within(dialog).getByRole("button", { name: "Save grant" }));
    expect(
      await within(form).findByText("Give a justification of 10 to 300 characters"),
    ).toBeTruthy();
    expect(within(form).getByText("Select at least one district")).toBeTruthy();
    expect(
      within(form)
        .getByRole("textbox", { name: /Justification/ })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect((await grantIn(store, ADMIN_GRANT_IDS.analystAlpha))?.version).toBe(1);
  });

  it("RW: the same validation messages in Kinyarwanda", async () => {
    const user = userEvent.setup();
    const { dialog, form } = await openEditor(user, PERSONA_IDS.analystAlpha, { rw: true });
    await user.click(within(dialog).getByRole("button", { name: "Bika uburenganzira" }));
    expect(
      await within(form).findByText("Tanga impamvu ifite inyuguti 10 kugeza 300"),
    ).toBeTruthy();
  });

  it("narrowing the analyst to one facility saves v2 with a before/after audit", async () => {
    const user = userEvent.setup();
    const { dialog, form, store } = await openEditor(user, PERSONA_IDS.analystAlpha);
    await user.click(within(form).getByRole("radio", { name: "Selected facilities only" }));
    await user.click(within(form).getByRole("checkbox", { name: "Demo Health Centre Alpha-2" }));
    await user.type(
      within(form).getByRole("textbox", { name: /Justification/ }),
      "Supervision review limited to Alpha-2 (demo).",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save grant" }));
    expect(await screen.findByText("Access grant saved")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("grant-edit-form")).toBeNull());
    expect(await grantIn(store, ADMIN_GRANT_IDS.analystAlpha)).toMatchObject({
      version: 2,
      facilityIds: [FACILITY_IDS.alpha2],
      updatedBy: PERSONA_IDS.leadProgramme,
    });
    const [changed] = await auditEvents(store, "admin.access_grant.changed");
    expect(changed).toMatchObject({
      actorId: PERSONA_IDS.leadProgramme,
      justification: "Supervision review limited to Alpha-2 (demo).",
      changeSummary: {
        before: { facilityIds: "ALL_IN_DISTRICTS" },
        after: { facilityIds: [FACILITY_IDS.alpha2] },
        fromVersion: 1,
        toVersion: 2,
      },
    });
    await waitFor(() =>
      expect(
        screen
          .getByTestId(`grant-row-${PERSONA_IDS.analystAlpha}`)
          .getAttribute("data-highlighted"),
      ).toBe("true"),
    );
  });

  it("LAST_ADMIN: removing your own roles.configure (role change or revoke) is blocked", async () => {
    const user = userEvent.setup();
    const { dialog, form, store } = await openEditor(user, PERSONA_IDS.leadProgramme);
    await user.selectOptions(within(form).getByRole("combobox", { name: /Role/ }), "auditor");
    await user.type(
      within(form).getByRole("textbox", { name: /Justification/ }),
      "Stepping down as demo administrator.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save grant" }));
    expect(
      await within(form).findByText("At least one active administrator must remain"),
    ).toBeTruthy();
    await user.selectOptions(
      within(form).getByRole("combobox", { name: /Role/ }),
      "programme_lead",
    );
    await user.click(within(form).getByRole("button", { name: "Revoke now" }));
    expect(
      await within(form).findByText("At least one active administrator must remain"),
    ).toBeTruthy();
    expect((await grantIn(store, ADMIN_GRANT_IDS.leadProgramme))?.version).toBe(1);
    expect(await auditEvents(store, "admin.access_grant.changed")).toHaveLength(0);
  });

  it("a simulated stale version shows the conflict notice; re-apply saves on the latest", async () => {
    const user = userEvent.setup();
    const { dialog, form, store } = await openEditor(user, PERSONA_IDS.analystAlpha);
    await user.click(within(form).getByRole("button", { name: "DEMO: simulate stale version" }));
    await screen.findByText("The next save of this grant will meet a newer version (demo).");
    await user.type(
      within(form).getByRole("textbox", { name: /Justification/ }),
      "Quarterly scope confirmation (demo).",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save grant" }));
    expect(await within(form).findByText("This grant was changed by someone else")).toBeTruthy();
    expect(await auditEvents(store, "conflict.detected")).toHaveLength(1);
    await user.click(within(form).getByRole("button", { name: /Re-apply/i }));
    expect(await screen.findByText("Access grant saved")).toBeTruthy();
    expect((await grantIn(store, ADMIN_GRANT_IDS.analystAlpha))?.version).toBe(2);
  });

  it("non-admin personas see the Roles tab read-only (no Edit, lock note)", async () => {
    for (const personaId of [PERSONA_IDS.auditorProgramme, PERSONA_IDS.analystAlpha]) {
      const { unmount } = await bootApp({
        path: ROLES_TAB,
        signInAs: personaId,
        waitFor: "grant-table",
      });
      expect(screen.getByTestId("roles-read-only").textContent).toContain(
        "only the programme lead (roles.configure) can change access grants",
      );
      await screen.findByTestId(`grant-row-${PERSONA_IDS.analystAlpha}`);
      expect(screen.queryByRole("button", { name: /Edit the access grant/ })).toBeNull();
      unmount();
    }
  });
});
