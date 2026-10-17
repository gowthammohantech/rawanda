/**
 * Top-bar patient search (CLN-03 task 10): Enter navigates to `/clinical/patients?q=…`;
 * `⌘K` / `Ctrl+K` focuses it from anywhere in the shell.
 */
import { SearchInput, useTx } from "@laif/ui-web";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { routes } from "../../app/routes.ts";

/** Keyboard hint glyph (not translatable). */
const SEARCH_SHORTCUT = "⌘K";

export function TopbarPatientSearch() {
  const t = useTx();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      role="search"
      aria-label={t("clinical:patients.topbar.label")}
      className="w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        setValue("");
        void navigate(routes.patients(q === "" ? {} : { q }));
      }}
    >
      <SearchInput
        ref={input}
        label={t("clinical:patients.topbar.label")}
        placeholder={t("clinical:patients.topbar.placeholder")}
        value={value}
        onValueChange={setValue}
        shortcut={SEARCH_SHORTCUT}
        shortcutLabel={t("clinical:patients.topbar.shortcut")}
        data-testid="topbar-search"
      />
    </form>
  );
}
