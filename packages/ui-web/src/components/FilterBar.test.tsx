import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { FilterBar, type FilterDefinition } from "./FilterBar.tsx";
import { SearchInput } from "./SearchInput.tsx";

type Filters = { status: "all" | "pending" | "done"; facility: string };

const filters: FilterDefinition<Filters>[] = [
  {
    id: "status",
    kind: "segmented",
    label: "Status",
    options: [
      { value: "all", label: "All", count: 12 },
      { value: "pending", label: "Pending" },
      { value: "done", label: "Done" },
    ],
  },
  {
    id: "facility",
    kind: "select",
    label: "Facility",
    options: [
      { value: "", label: "All facilities" },
      { value: "fac-alpha-1", label: "Alpha-1" },
    ],
  },
];

function Harness({ onChange }: { onChange: (f: Filters) => void }) {
  const [value, setValue] = useState<Filters>({ status: "all", facility: "" });
  return (
    <FilterBar
      filters={filters}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      resultCount={value.status === "all" ? 12 : 1}
      onReset={() => setValue({ status: "all", facility: "" })}
    />
  );
}

describe("FilterBar", () => {
  it("emits typed filter state and announces the result count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderUi(<Harness onChange={onChange} />);
    expect(screen.getByRole("status").textContent).toBe("12 results");
    await user.click(screen.getByRole("button", { name: "Pending" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "pending", facility: "" });
    expect(screen.getByRole("button", { name: "Pending" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status").textContent).toBe("1 result");
    await user.selectOptions(screen.getByLabelText("Facility"), "fac-alpha-1");
    expect(onChange).toHaveBeenLastCalledWith({ status: "pending", facility: "fac-alpha-1" });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status").textContent).toBe("12 results");
    await expectNoAxeViolations(container);
  });
});

describe("SearchInput", () => {
  it("has a label, a shortcut hint and reports changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = renderUi(
      <SearchInput
        label="Search patients"
        value=""
        onValueChange={onValueChange}
        shortcut="⌘K"
        shortcutLabel="Press ⌘K"
      />,
    );
    const input = screen.getByRole("searchbox", { name: "Search patients" });
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    await user.type(input, "u");
    expect(onValueChange).toHaveBeenCalledWith("u");
    await expectNoAxeViolations(container);
  });
});
