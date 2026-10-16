import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { AccessibleDataTable, type DataTableColumn } from "./AccessibleDataTable.tsx";
import { Pagination } from "./Pagination.tsx";

type Row = { id: string; name: string; age: number };
const rows: Row[] = [
  { id: "p1", name: "Uwase", age: 54 },
  { id: "p2", name: "Habimana", age: 61 },
  { id: "p3", name: "Mukamana", age: 47 },
];
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name, isRowHeader: true },
  { id: "age", header: "Age", cell: (r) => r.age, sortValue: (r) => r.age, align: "end" },
];

const names = () => screen.getAllByRole("rowheader").map((cell) => cell.textContent);

describe("AccessibleDataTable", () => {
  it("renders caption, scoped headers, row headers and the showing footer", async () => {
    const { container } = renderUi(
      <AccessibleDataTable
        caption="Patients"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        totalCount={24}
      />,
    );
    expect(screen.getByRole("table", { name: "Patients" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(names()).toEqual(["Uwase", "Habimana", "Mukamana"]);
    expect(screen.getByText("Showing 3 of 24")).toBeTruthy();
    expect(container.querySelector("td[data-label='Age']")).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it("sorts with the keyboard and updates aria-sort", async () => {
    const user = userEvent.setup();
    renderUi(
      <AccessibleDataTable
        caption="Patients"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
      />,
    );
    const ageHeader = screen.getByRole("columnheader", { name: /Age/ });
    expect(ageHeader.getAttribute("aria-sort")).toBe("none");
    const sortButton = within(ageHeader).getByRole("button");
    sortButton.focus();
    await user.keyboard("{Enter}");
    expect(ageHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(names()).toEqual(["Mukamana", "Uwase", "Habimana"]);
    await user.keyboard(" ");
    expect(ageHeader.getAttribute("aria-sort")).toBe("descending");
    expect(names()).toEqual(["Habimana", "Uwase", "Mukamana"]);
    expect(screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort")).toBe(
      "none",
    );
  });

  it("delegates sorting when controlled (server-side)", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderUi(
      <AccessibleDataTable
        caption="Patients"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    await user.click(
      within(screen.getByRole("columnheader", { name: /Name/ })).getByRole("button"),
    );
    expect(onSortChange).toHaveBeenCalledWith({ columnId: "name", direction: "ascending" });
    expect(names()).toEqual(["Uwase", "Habimana", "Mukamana"]);
  });

  it("renders a labelled row action and an empty slot", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { unmount } = renderUi(
      <AccessibleDataTable
        caption="Patients"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowAction={{ label: "Open", accessibleLabel: (r) => `Open ${r.name}`, onAction }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open Habimana" }));
    expect(onAction).toHaveBeenCalledWith(rows[1]);
    unmount();

    renderUi(
      <AccessibleDataTable caption="Patients" columns={columns} rows={[]} getRowId={(r) => r.id} />,
    );
    expect(screen.getByText("No results match these filters.")).toBeTruthy();
  });
});

describe("Pagination", () => {
  it("pages forward and back and disables at the ends", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { container } = renderUi(
      <Pagination page={1} pageSize={25} total={60} onPageChange={onPageChange} />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Previous page" }).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    await expectNoAxeViolations(container);
  });
});
