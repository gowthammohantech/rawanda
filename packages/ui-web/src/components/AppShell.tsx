import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

import { SkipLink } from "../a11y/SkipLink.tsx";
import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { DemoBanner } from "./DemoBanner.tsx";
import { Drawer } from "./Drawer.tsx";
import type { SidebarProps } from "./Sidebar.tsx";
import { Topbar, type TopbarProps } from "./Topbar.tsx";

export type AppShellProps = {
  /** Usually `<Sidebar … />`; rendered inline ≥ 1024 px and in a drawer below. */
  sidebar: ReactNode;
  /** Topbar configuration; the Topbar (with its LanguageSwitcher) is always rendered. */
  topbar?: Omit<TopbarProps, "onOpenNavigation">;
  /** Banners under the topbar (RoleBanner, OfflineBanner …). The DemoBanner is not optional. */
  banners?: ReactNode;
  /**
   * Optional icon rail shown from 768 px to 1023 px (tablet), next to the menu button that opens
   * the full sidebar drawer. Omitted = the drawer only below 1024 px (unchanged default).
   */
  rail?: ReactNode;
  /** Narrower inline sidebar (208 px) from 1024 px to 1279 px, the full 240 px from 1280 px. */
  compactSidebar?: boolean;
  children?: ReactNode;
  className?: string;
};

/**
 * Grey canvas + rounded shell + sidebar + topbar + `<main id="main">`. Always renders the
 * SkipLink, the DemoBanner ("DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE")
 * and a LanguageSwitcher; none of them can be turned off by props.
 */
export function AppShell({
  sidebar,
  topbar,
  banners,
  rail,
  compactSidebar = false,
  children,
  className,
}: AppShellProps) {
  const t = useTx();
  const [navOpen, setNavOpen] = useState(false);
  const drawerSidebar = isValidElement(sidebar)
    ? cloneElement(sidebar as ReactElement<SidebarProps>, { onNavigate: () => setNavOpen(false) })
    : sidebar;

  return (
    <div className={cx("bg-canvas lg:bg-border min-h-dvh", className)}>
      <SkipLink />
      <DemoBanner />
      <div
        data-testid="app-shell"
        className="bg-canvas lg:rounded-shell mx-auto flex max-w-[1600px] gap-6 p-3 sm:p-4 lg:my-4 lg:w-[calc(100%-32px)] lg:p-5"
      >
        <aside
          className={cx(
            "sticky top-12 hidden max-h-[calc(100dvh-120px)] min-h-[560px] shrink-0 self-start lg:block",
            compactSidebar ? "w-52 xl:w-60" : "w-60",
          )}
        >
          {sidebar}
        </aside>
        {rail === undefined ? null : (
          <div className="sticky top-12 hidden shrink-0 self-start md:block lg:hidden">{rail}</div>
        )}
        <Drawer
          open={navOpen}
          onOpenChange={setNavOpen}
          title={t("shell:navigation")}
          hideTitle
          side="start"
        >
          {drawerSidebar}
        </Drawer>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="space-y-3">
            <Topbar {...topbar} onOpenNavigation={() => setNavOpen(true)} />
            {banners === undefined ? null : <div className="space-y-2">{banners}</div>}
          </header>
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 space-y-5 outline-none">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
