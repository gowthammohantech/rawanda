import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderUi } from "../test/helpers.tsx";
import { SkipLink } from "./SkipLink.tsx";
import { useFocusReturn } from "./useFocusReturn.ts";
import { VisuallyHidden } from "./VisuallyHidden.tsx";

function Overlay() {
  const [open, setOpen] = useState(false);
  useFocusReturn(open);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open ? (
        <button type="button" ref={(el) => el?.focus()} onClick={() => setOpen(false)}>
          close
        </button>
      ) : null}
    </div>
  );
}

describe("a11y helpers", () => {
  it("SkipLink targets #main with translated text", () => {
    renderUi(<SkipLink />, { language: "rw" });
    const link = screen.getByRole("link", { name: "Jya ku bikubiyemo by'ingenzi" });
    expect(link.getAttribute("href")).toBe("#main");
  });

  it("VisuallyHidden renders sr-only content", () => {
    const { container } = render(<VisuallyHidden>hidden</VisuallyHidden>);
    expect(container.querySelector(".sr-only")?.textContent).toBe("hidden");
  });

  it("useFocusReturn returns focus to the opener", () => {
    render(<Overlay />);
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    const close = screen.getByRole("button", { name: "close" });
    act(() => close.focus());
    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
  });
});
