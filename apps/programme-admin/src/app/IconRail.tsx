/**
 * Tablet icon rail (ADM-09 task 8: 768–1023 px): one icon link per sidebar item with its label as
 * accessible name and tooltip; items the role lacks are shown locked (`aria-disabled`, reason as
 * screen-reader text). The menu button in the topbar still opens the full sidebar drawer.
 */
import { cx, Icon, useTx, type SidebarSection } from "@laif/ui-web";
import { NavLink } from "react-router";

export function IconRail({ sections }: { sections: readonly SidebarSection[] }) {
  const t = useTx();
  return (
    <nav aria-label={t("admin:shell.nav.rail")} data-testid="icon-rail">
      <ul className="bg-surface shadow-card m-0 flex list-none flex-col gap-1 rounded-lg p-1.5">
        {sections.flatMap((section) =>
          section.items.map((item) => {
            const label = t(item.labelKey);
            return (
              <li key={item.to}>
                {item.disabled === true ? (
                  <span
                    aria-disabled="true"
                    title={`${label} — ${item.disabledReason ?? ""}`}
                    className="text-muted flex size-11 cursor-not-allowed items-center justify-center rounded-md opacity-60"
                  >
                    <Icon name="lock" size={18} />
                    <span className="sr-only">{`${label}, ${item.disabledReason ?? ""}`}</span>
                  </span>
                ) : (
                  <NavLink
                    to={item.to}
                    title={label}
                    aria-label={label}
                    className={({ isActive }) =>
                      cx(
                        "flex size-11 items-center justify-center rounded-md",
                        isActive
                          ? "bg-primary-soft text-primary-dark"
                          : "text-ink/80 hover:bg-background",
                      )
                    }
                  >
                    <Icon name={item.icon} size={18} />
                  </NavLink>
                )}
              </li>
            );
          }),
        )}
      </ul>
    </nav>
  );
}
